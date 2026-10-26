import type { OfflineGrant } from './offlineExam';

export const EVIDENCE_LIMIT=100*1024*1024;
export interface EvidenceMeta {
  key:string;owner:string;attempt:number;token:string;deadline:string;
  captured:number;uploaded:number;bytes:number;pendingBytes:number;lastCapturedAt:number;
  closed:boolean;finished:boolean;truncated:boolean;
}
export interface EvidenceFrame { id:string;key:string;owner:string;attempt:number;token:string;capturedAt:string;sequence:number;jpeg:Blob }
let database:Promise<IDBDatabase>|undefined;
function open(){
  return database??=new Promise<IDBDatabase>((resolve,reject)=>{
    let settled=false;
    const request=indexedDB.open('examflow-offline-evidence',1);
    const timer=setTimeout(()=>{settled=true;reject(new Error('Không mở được bộ nhớ ảnh ngoại tuyến.'));},4000);
    request.onupgradeneeded=()=>{
      const frames=request.result.createObjectStore('frames',{keyPath:'id'});frames.createIndex('owner','owner');frames.createIndex('key','key');
      const meta=request.result.createObjectStore('meta',{keyPath:'key'});meta.createIndex('owner','owner');
    };
    request.onsuccess=()=>{clearTimeout(timer);if(settled){request.result.close();return;}settled=true;resolve(request.result);request.result.onversionchange=()=>{request.result.close();database=undefined;};};
    request.onerror=request.onblocked=()=>{settled=true;clearTimeout(timer);reject(new Error('Không mở được bộ nhớ ảnh ngoại tuyến.'));};
  }).catch(error=>{database=undefined;throw error;});
}
async function transaction<T>(mode:IDBTransactionMode,work:(frames:IDBObjectStore,meta:IDBObjectStore,done:(value:T)=>void)=>void){
  const db=await open();return new Promise<T>((resolve,reject)=>{
    const tx=db.transaction(['frames','meta'],mode,mode==='readwrite'?{durability:'strict'}:undefined);let value:T;
    tx.oncomplete=()=>resolve(value);tx.onerror=()=>{};tx.onabort=()=>reject(tx.error??new Error('Chưa lưu được ảnh trên máy.'));
    try{work(tx.objectStore('frames'),tx.objectStore('meta'),result=>{value=result;});}catch(error){tx.abort();reject(error);}
  });
}
/** Pure policy shared by storage and tests. The limit applies to both pending browser data and cumulative attempt data. */
export function canSaveFrame(meta:EvidenceMeta,queuedBytes:number,size:number,at:number){
  if(meta.closed||meta.truncated||at>=Date.parse(meta.deadline)||at-meta.lastCapturedAt<4500)return 'skip';
  if(size>250000||size<4)return 'invalid';
  return queuedBytes+size>EVIDENCE_LIMIT||meta.bytes+size>EVIDENCE_LIMIT||meta.captured>=17280?'full':'save';
}
export const offlineEvidenceStore={
  begin(owner:string,attempt:number,grant:OfflineGrant){
    return transaction<void>('readwrite',(_frames,meta)=>{
      const key=JSON.stringify([owner,attempt]),request=meta.get(key);
      request.onsuccess=()=>{if(!request.result)meta.put({key,owner,attempt,token:grant.token,deadline:grant.deadline,captured:0,uploaded:0,bytes:0,pendingBytes:0,lastCapturedAt:0,closed:false,finished:false,truncated:false} satisfies EvidenceMeta);};
    });
  },
  list(owner:string){return transaction<EvidenceMeta[]>('readonly',(_frames,meta,done)=>{const request=meta.index('owner').getAll(owner);request.onsuccess=()=>done(request.result);});},
  add(owner:string,attempt:number,jpeg:Blob,at:number){
    return transaction<string>('readwrite',(frames,meta,done)=>{
      const key=JSON.stringify([owner,attempt]),request=meta.getAll();
      request.onsuccess=()=>{
        const rows=request.result as EvidenceMeta[],current=rows.find(row=>row.key===key);if(!current){done('skip');return;}
        const decision=canSaveFrame(current,rows.reduce((sum,row)=>sum+row.pendingBytes,0),jpeg.size,at);
        if(decision==='full'){meta.put({...current,truncated:true});done(decision);return;}
        if(decision!=='save'){done(decision);return;}
        const sequence=current.captured+1,id=crypto.randomUUID();
        frames.add({id,key,owner,attempt,token:current.token,capturedAt:new Date(at).toISOString(),sequence,jpeg} satisfies EvidenceFrame);
        meta.put({...current,captured:sequence,bytes:current.bytes+jpeg.size,pendingBytes:current.pendingBytes+jpeg.size,lastCapturedAt:at,finished:false});done('save');
      };
    });
  },
  next(owner:string){return transaction<EvidenceFrame|undefined>('readonly',(frames,_meta,done)=>{const request=frames.index('owner').openCursor(owner);request.onsuccess=()=>done(request.result?.value);});},
  ack(id:string){return transaction<void>('readwrite',(frames,meta)=>{
    const request=frames.get(id);request.onsuccess=()=>{
      const frame=request.result as EvidenceFrame|undefined;if(!frame)return;
      const lookup=meta.get(frame.key);lookup.onsuccess=()=>{const value=lookup.result as EvidenceMeta;if(value)meta.put({...value,uploaded:value.uploaded+1,pendingBytes:Math.max(0,value.pendingBytes-frame.jpeg.size)});frames.delete(id);};
    };
  });},
  close(key:string){return transaction<void>('readwrite',(_frames,meta)=>{const request=meta.get(key);request.onsuccess=()=>{if(request.result)meta.put({...request.result,closed:true});};});},
  finished(key:string){return transaction<void>('readwrite',(_frames,meta)=>{const request=meta.get(key);request.onsuccess=()=>{if(request.result)meta.put({...request.result,finished:true,token:''});};});},
  truncated(key:string){return transaction<void>('readwrite',(_frames,meta)=>{const request=meta.get(key);request.onsuccess=()=>{if(request.result)meta.put({...request.result,truncated:true});};});},
};

export function encodeEvidence(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Không đọc được ảnh đang chờ gửi.'));reader.readAsDataURL(blob);});}
/** A durable receipt for this exact UUID is required before deleting the local image. */
export async function deliverEvidence(frame:EvidenceFrame,send:(frame:EvidenceFrame)=>Promise<{captureId:string;received:boolean}>,ack:(id:string)=>Promise<void>){
  const result=await send(frame);if(!result.received||result.captureId!==frame.id)throw new Error('Máy chủ chưa xác nhận lưu ảnh.');await ack(frame.id);
}
