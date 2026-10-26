import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@shared/services/api';
import { examCamera, type CameraLease } from '../services/examCamera';
import type { OfflineGrant } from '../services/offlineExam';
import { offlineEvidenceStore as store, encodeEvidence, deliverEvidence, type EvidenceMeta } from '../services/offlineEvidence';

interface Props { owner:string;attempt:number|null;grant?:OfflineGrant;capturing:boolean;unavailable:boolean;deferUpload:boolean;clock:()=>number }
export function OfflineEvidence(props:Props){
  const input=useRef(props);input.current=props;
  const [rows,setRows]=useState<EvidenceMeta[]>([]),[captureError,setCaptureError]=useState('');
  useEffect(()=>{
    if(!props.owner)return;
    setRows([]);setCaptureError('');waitingRef.current=false;
    let disposed=false,busy=false,uploadBusy=false,lease:CameraLease|undefined,lastAttempt:number|null=null,nextUpload=0,lastCapture=0,nextTick=0,lastMode='';
    const prepared=new Set<string>();
    const abort=new AbortController(),video=document.createElement('video'),canvas=document.createElement('canvas');
    video.muted=true;video.playsInline=true;
    const release=()=>{video.pause();video.srcObject=null;lease?.release();lease=undefined;};
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(waitingRef.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',beforeUnload);
    async function tick(){
      if(disposed||busy)return;
      const current=input.current,now=current.clock(),key=current.attempt?JSON.stringify([current.owner,current.attempt]):null;
      const mode=`${key}:${current.capturing}:${current.unavailable}:${current.grant?.offlineEvidenceEnabled}`;
      if(mode===lastMode&&Date.now()<nextTick)return;
      lastMode=mode;nextTick=Date.now()+5000;busy=true;
      try{
        if(current.attempt&&current.grant?.offlineEvidenceEnabled){
          if(!prepared.has(key!)){await store.begin(current.owner,current.attempt,current.grant);prepared.add(key!);}
          lastAttempt=current.attempt;
        }else if(lastAttempt){await store.close(JSON.stringify([current.owner,lastAttempt]));lastAttempt=null;nextUpload=0;}
        let metadata=await store.list(current.owner);
        let changed=false;
        for(const row of metadata)if(!row.closed&&(now>=Date.parse(row.deadline)||row.key===key&&!current.capturing)){
          await store.close(row.key);row.closed=true;changed=true;nextUpload=0;
        }
        const active=metadata.find(row=>row.key===key);
        if(current.capturing&&current.unavailable&&active&&!active.closed&&!active.truncated&&now<Date.parse(active.deadline)){
          if(!lease||!lease.stream.getVideoTracks().some(track=>track.readyState==='live'&&track.enabled&&!track.muted)){
            release();const acquired=await examCamera.acquire();if(disposed){acquired.release();return;}lease=acquired;video.srcObject=lease.stream;await video.play();
          }
          if(now-lastCapture>=4500&&video.readyState>=2&&video.videoWidth){
            const ratio=Math.min(1,640/video.videoWidth,480/video.videoHeight);canvas.width=Math.round(video.videoWidth*ratio);canvas.height=Math.round(video.videoHeight*ratio);
            canvas.getContext('2d')!.drawImage(video,0,0,canvas.width,canvas.height);
            const at=current.clock();lastCapture=at;
            const jpeg=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.65));
            if(disposed)return;
            if(jpeg&&input.current.capturing&&input.current.attempt===current.attempt&&current.clock()<Date.parse(active.deadline)){
              let saved:string;
              try{saved=await store.add(current.owner,current.attempt!,jpeg,at);}catch(error){await store.truncated(active.key).catch(()=>{});throw error;}
              if(saved==='save'){setCaptureError('');changed=true;nextUpload=0;}
              if(saved==='full')changed=true;
              if(saved==='invalid')throw new Error('Không nén được ảnh camera trong giới hạn cho phép.');
            }
          }
        }else release();
        if(changed)metadata=await store.list(current.owner);
        if(!disposed){setRows(previous=>previous.length===metadata.length&&previous.every((row,i)=>row.key===metadata[i].key&&row.captured===metadata[i].captured&&row.uploaded===metadata[i].uploaded&&row.closed===metadata[i].closed&&row.finished===metadata[i].finished&&row.truncated===metadata[i].truncated)?previous:metadata);const pending=metadata.some(row=>row.captured>row.uploaded||row.closed&&!row.finished);waitingRef.current=pending;}
      }catch{
        if(!disposed)setCaptureError('Chưa lưu thêm được ảnh giám sát. Giữ trang mở và báo giám thị; đáp án vẫn được lưu riêng.');
      }finally{busy=false;}
    }
    async function pump(){
      if(disposed||uploadBusy)return;
      uploadBusy=true;
      try{
        const current=input.current;
        // The frozen answer snapshot goes first. Backfill never blocks submission.
        if(!current.deferUpload&&navigator.onLine!==false&&Date.now()>=nextUpload&&!disposed){
          const frame=await store.next(current.owner);
          try{
            if(frame)await deliverEvidence(frame,async value=>apiFetch(`/student/attempts/${value.attempt}/offline-evidence`,{method:'POST',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(22000)]),body:JSON.stringify({token:value.token,captureId:value.id,capturedAt:value.capturedAt,sequence:value.sequence,jpeg:await encodeEvidence(value.jpeg)})}),store.ack);
            else for(const row of await store.list(current.owner))if(row.closed&&!row.finished&&row.uploaded===row.captured){
              await apiFetch(`/student/attempts/${row.attempt}/offline-evidence/finish`,{method:'POST',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(8000)]),body:JSON.stringify({token:row.token,capturedCount:row.captured,truncated:row.truncated})});
              await store.finished(row.key);
            }
            nextUpload=Date.now()+(frame?1000:5000);
          }catch{nextUpload=Date.now()+5000;}
        }
      }catch{nextUpload=Date.now()+5000;}
      finally{uploadBusy=false;}
    }
    const timer=setInterval(()=>{void tick();void pump();},1000);void tick();void pump();
    return()=>{disposed=true;abort.abort();clearInterval(timer);window.removeEventListener('beforeunload',beforeUnload);release();};
  },[props.owner]);
  const waitingRef=useRef(false);
  const bytes=rows.reduce((sum,row)=>sum+row.pendingBytes,0);
  const truncated=rows.some(row=>row.truncated&&(!row.finished||row.attempt===props.attempt));
  const nearLimit=rows.some(row=>!row.closed&&row.bytes>=80*1024*1024)||bytes>=80*1024*1024;
  // Keep the working exam calm. The queue continues in the effects above;
  // only a failure to preserve evidence locally needs attention during the exam.
  if(props.capturing){
    if(!captureError&&!truncated&&!nearLimit)return null;
    return <section className="student-notice warning" role="alert" style={{marginBottom:16}}><div><strong>Cần kiểm tra lưu ảnh giám sát</strong><p>{captureError|| (truncated?'Không lưu thêm được ảnh giám sát do giới hạn bộ nhớ. Báo giám thị để được hỗ trợ.':'Bộ nhớ ảnh giám sát sắp đầy. Báo giám thị nếu mất kết nối kéo dài.')}</p></div></section>;
  }
  // Uploading continues in the background after submission, without a student status panel.
  return null;
}
