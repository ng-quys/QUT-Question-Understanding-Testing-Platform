import type { StudentAttempt } from './studentService';
import type { DraftAnswer } from './attemptRecovery';

export interface OfflineGrant { token:string;deadline:string;serverTime:string;cameraRequired?:boolean;offlineEvidenceEnabled?:boolean }
export interface FrozenSubmission { token:string;submissionId:string;frozenAt:string;offlineSince?:string;answers:{questionId:number;answerId:number}[] }
export interface OfflineExamRecord {
  key:string;owner:string;attempt:StudentAttempt;grant:OfflineGrant;selected:Record<number,number>;
  offlineSince?:string;frozen?:FrozenSubmission;savedAt:number;clockOffset:number;
  answerTimes?:Record<number,number>;
}
export interface OfflineExamStore { put(record:OfflineExamRecord):Promise<void>;list(owner:string):Promise<OfflineExamRecord[]>;remove(key:string):Promise<void> }
let database:Promise<IDBDatabase>|undefined;
function open(){
  return database??=(new Promise<IDBDatabase>((resolve,reject)=>{
    let settled=false;
    const request=indexedDB.open('examflow-offline-exams',1);
    const fail=()=>{if(!settled){settled=true;clearTimeout(timer);reject(new Error('Không mở được bộ nhớ bài thi.'));}};
    const timer=setTimeout(fail,4000);
    request.onupgradeneeded=()=>{const store=request.result.createObjectStore('exams',{keyPath:'key'});store.createIndex('owner','owner');};
    request.onsuccess=()=>{clearTimeout(timer);if(settled){request.result.close();return;}settled=true;request.result.onversionchange=()=>{request.result.close();database=undefined;};resolve(request.result);};
    request.onerror=request.onblocked=fail;
  })).catch(error=>{database=undefined;throw error;});
}
async function transaction<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore,done:(value:T)=>void)=>void):Promise<T>{
  const db=await open();return new Promise<T>((resolve,reject)=>{
    const tx=db.transaction('exams',mode,mode==='readwrite'?{durability:'strict'}:undefined);let result:T;
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error??new Error('Chưa lưu được bài trên máy.'));
    tx.onerror=()=>{};
    try{work(tx.objectStore('exams'),value=>{result=value;});}catch(error){tx.abort();reject(error);}
  });
}
export const offlineExamStore:OfflineExamStore={
  put:record=>transaction<void>('readwrite',store=>{store.put(record);}),
  list:owner=>transaction<OfflineExamRecord[]>('readonly',(store,done)=>{const request=store.index('owner').getAll(owner);request.onsuccess=()=>done(request.result);}),
  remove:key=>transaction<void>('readwrite',store=>{store.delete(key);}),
};

/** Keep time monotonic while the tab is open, including after a system clock rollback. */
export class ExamClock {
  private anchor:number;private tick:number;private last:number;
  private wall:()=>number;private monotonic:()=>number;
  constructor(serverTime:number,wall=()=>Date.now(),monotonic=()=>performance.now()){
    this.wall=wall;this.monotonic=monotonic;
    this.anchor=serverTime;this.tick=monotonic();this.last=serverTime;this.offset=serverTime-wall();
  }
  private offset:number;
  now(){return this.last=Math.max(this.last,this.anchor+this.monotonic()-this.tick,this.wall()+this.offset);}
}

export class OfflineExam {
  private writes:Promise<void>=Promise.resolve();private error:unknown;
  readonly record:OfflineExamRecord;private store:OfflineExamStore;private clock:()=>number;
  constructor(record:OfflineExamRecord,store:OfflineExamStore=offlineExamStore,clock=()=>Date.now()){this.record=record;this.store=store;this.clock=clock;}
  static create(owner:string,attempt:StudentAttempt,grant:OfflineGrant,selected:Record<number,number>,store?:OfflineExamStore,clock?:()=>number){
    const now=clock?.()??Date.parse(grant.serverTime);
    return new OfflineExam({key:JSON.stringify([owner,attempt.attemptId]),owner,attempt,grant,selected:{...selected},savedAt:now,clockOffset:now-Date.now()},store,clock);
  }
  private persist(){
    // Questions are immutable for this attempt. IndexedDB performs the durable
    // structured clone; only mutable answers need a separate snapshot here.
    const copy={...this.record,selected:{...this.record.selected},answerTimes:{...this.record.answerTimes},
      frozen:this.record.frozen?structuredClone(this.record.frozen):undefined,savedAt:this.clock()};
    const write=this.writes.catch(()=>{}).then(()=>this.store.put(copy)).then(()=>{this.error=undefined;});
    this.writes=write;void write.catch(error=>{this.error=error;});return write;
  }
  save(){return this.persist();}
  choose(questionId:number,answerId:number,changedAt=this.clock()){
    if(this.record.frozen||this.clock()>=Date.parse(this.record.grant.deadline))return false;
    if(!this.record.attempt.questions.some(q=>q.questionId===questionId&&q.options.some(option=>option.id===answerId)))return false;
    this.record.selected={...this.record.selected,[questionId]:answerId};
    this.record.answerTimes={...this.record.answerTimes,[questionId]:changedAt};void this.persist().catch(()=>{});return true;
  }
  disconnected(){if(!this.record.offlineSince){this.record.offlineSince=new Date(Math.min(this.clock(),Date.parse(this.record.grant.deadline))).toISOString();void this.persist().catch(()=>{});}}
  async freeze(){
    if(!this.record.frozen){
      this.record.frozen={token:this.record.grant.token,submissionId:crypto.randomUUID(),
        frozenAt:new Date(Math.min(this.clock(),Date.parse(this.record.grant.deadline))).toISOString(),offlineSince:this.record.offlineSince,
        answers:Object.entries(this.record.selected).map(([question,answer])=>({questionId:Number(question),answerId:answer}))};
    }
    await this.persist();this.error=undefined;
    return structuredClone(this.record.frozen);
  }
  get storageError(){return Boolean(this.error);}
  async complete(){await this.writes.catch(()=>{});await this.store.remove(this.record.key);}
}

/** A failed write in either independent local store must not resurrect an older choice. */
export function reconcileOfflineRecord(record:OfflineExamRecord,drafts:DraftAnswer[]):OfflineExamRecord {
  const result=structuredClone(record);
  if(result.frozen)return result; // An already frozen submission is immutable, including on reload.
  for(const draft of drafts){
    const changed=draft.changedAt;
    if(draft.owner!==record.owner||draft.attemptId!==record.attempt.attemptId||typeof changed!=='number'||!Number.isFinite(changed)||changed>=Date.parse(record.grant.deadline))continue;
    if(!record.attempt.questions.some(q=>q.questionId===draft.questionId&&q.options.some(option=>option.id===draft.answerId)))continue;
    const known=result.answerTimes?.[draft.questionId];
    if(known!==undefined?changed<=known:changed<Date.parse(record.grant.serverTime))continue;
    result.selected[draft.questionId]=draft.answerId;
    result.answerTimes={...result.answerTimes,[draft.questionId]:changed};
  }
  return result;
}

export async function submitOrRecoverResult<T extends {attemptId:number;status:string}>(attemptId:number,send:()=>Promise<T>,result:()=>Promise<T>){
  try{return {data:await send(),recovered:false};}
  catch(original){
    try{
      const data=await result();
      if(data.attemptId===attemptId&&['completed','submitted'].includes(data.status))return {data,recovered:true};
    }catch{ /* Keep the frozen local submission unless the server confirms a terminal result. */ }
    throw original;
  }
}
