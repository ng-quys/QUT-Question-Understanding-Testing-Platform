import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import './StudentMonitoring.css';
import { studentApi, type AiStatus } from '../services/studentService';

const encode=(bytes:Uint8Array)=>{let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);};
export function StudentMonitoring({attemptId}:{attemptId:number}){
 const [status,setStatus]=useState<AiStatus|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const video=useRef<HTMLVideoElement>(null);
 const latest=useRef<AiStatus|null>(null),resume=useRef<(()=>void)|null>(null);
 useEffect(()=>{
  let disposed=false,timer:ReturnType<typeof setTimeout>|undefined,frameTimer:ReturnType<typeof setTimeout>|undefined;
  let stream:MediaStream|undefined,audio:AudioContext|undefined,node:AudioWorkletNode|undefined,source:MediaStreamAudioSourceNode|undefined;
  let deviceStarting=false,deviceFailed=false,pcm=new Uint8Array(),pcmAt=0;
  const controller=new AbortController();
  const videoElement=video.current;
  latest.current=null;setStatus(null);setError('');
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
  const cleanupMedia=()=>{stream?.getTracks().forEach(track=>track.stop());node?.disconnect();source?.disconnect();if(audio)void audio.close().catch(()=>{});stream=undefined;node=undefined;source=undefined;audio=undefined;pcm=new Uint8Array();pcmAt=0;};
  async function devices(){
   if(deviceStarting||stream||deviceFailed)return;deviceStarting=true;
   try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Cần HTTPS hoặc localhost để truy cập camera và micro.');
    const acquired=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:10,max:15}},audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
    if(disposed){acquired.getTracks().forEach(track=>track.stop());return;}
    stream=acquired;
    for(const track of stream.getTracks())track.onended=()=>{if(!disposed){deviceFailed=true;setError('Camera hoặc micro đã ngừng hoạt động. Hãy kết nối lại.');}};
    if(videoElement){videoElement.srcObject=stream;await videoElement.play();}
    audio=new AudioContext();
    await audio.audioWorklet.addModule(`${import.meta.env.BASE_URL}monitor-audio-worklet.js`);
    if(disposed){cleanupMedia();return;}
    source=audio.createMediaStreamSource(stream);node=new AudioWorkletNode(audio,'qut-monitor-audio');
    const silent=audio.createGain();silent.gain.value=0;
    source.connect(node);node.connect(silent);silent.connect(audio.destination);
    node.port.onmessage=event=>{if(!disposed&&latest.current?.captureAllowed){pcm=new Uint8Array(event.data);pcmAt=Date.now();}};
    node.port.postMessage(Boolean(latest.current?.captureAllowed));
    resume.current=()=>{void audio?.resume().then(()=>setError('')).catch(()=>setError('Không bật được micro.'));};
    void audio.resume().catch(()=>{});
    if(audio.state==='suspended')setError('Nhấn “Bật camera/micro” để cho phép thu âm giám sát.');
   }catch(e){deviceFailed=true;cleanupMedia();setError(e instanceof Error?e.message:'Không truy cập được camera/micro.');}
   finally{deviceStarting=false;}
  }
  const poll=async()=>{
   try{
    const value=await studentApi.aiStatus(attemptId,AbortSignal.any([controller.signal,AbortSignal.timeout(6000)]));
    if(disposed)return;
    latest.current=value;setStatus(value);
    node?.port.postMessage(Boolean(value.captureAllowed));
    if(!value.captureAllowed){pcm=new Uint8Array();pcmAt=0;}
    if(value.required&&value.status!=='stopped')void devices();
    if(value.status==='stopped'||!value.required){cleanupMedia();deviceFailed=false;setError('');}
   }catch{if(!disposed){latest.current=null;node?.port.postMessage(false);setStatus({required:true,ready:false,status:'offline',message:'Chưa kết nối được giám sát. Bài thi vẫn tiếp tục.'});}}
   finally{if(!disposed)timer=setTimeout(poll,1500);}
  };
  const send=async()=>{
   try{
    const value=latest.current,element=videoElement;
    if(value?.captureAllowed&&typeof value.lease==='number'&&!deviceFailed&&element&&element.readyState>=2&&audio?.state==='running'&&Date.now()-pcmAt<1500){
     const ctx=canvas.getContext('2d');if(!ctx)return;
     ctx.drawImage(element,0,0,640,480);
     const jpeg=canvas.toDataURL('image/jpeg',.7).split(',')[1];
     const captured=pcm;pcm=new Uint8Array();pcmAt=0;
     if(captured.length){await studentApi.aiFrame(attemptId,{lease:value.lease,jpeg,audioPcm16:encode(captured)},AbortSignal.any([controller.signal,AbortSignal.timeout(6000)]));if(!disposed)setError('');}
    }
   }catch{if(!disposed)setError('Chưa gửi được dữ liệu giám sát. Hệ thống sẽ thử lại; bài làm vẫn được lưu.');}
   finally{if(!disposed)frameTimer=setTimeout(send,500);}
  };
  void poll();void send();
  return()=>{disposed=true;controller.abort();clearTimeout(timer);clearTimeout(frameTimer);resume.current=null;cleanupMedia();if(videoElement)videoElement.srcObject=null;};
 },[attemptId,retry]);
 const healthy=status?.ready&&!error;
 const warning=Boolean(error||status?.required&&['error','offline','unregistered'].includes(status.status));
 const label=warning?'AI cần kiểm tra':status?.status==='disabled'?'AI không yêu cầu':healthy?'AI đang giám sát':status?.status==='waiting'?'AI chờ giám sát':status?.status==='stopped'?'AI đã dừng':'AI đang kết nối';
 const Icon=warning?ShieldAlert:ShieldCheck;
 return <div className={`student-monitoring-compact ${warning?'needs-attention':''}`}>
  <span className="student-monitoring-label" role="status"><Icon size={15}/>{label}</span>
  <details className="student-monitoring-camera" hidden={!status?.required}><summary aria-label="Xem camera và trạng thái giám sát">Camera</summary><div><video ref={video} muted autoPlay playsInline aria-label="Camera của bạn"/><p>{status?.message}</p></div></details>
  {warning&&<div className="student-monitoring-warning" role="alert">
  <strong>Cần kiểm tra giám sát</strong>
  <p>{error||status?.message} Thời gian thi vẫn tiếp tục; báo giảng viên nếu lỗi kéo dài.</p>
  {error&&<button type="button" onClick={()=>{if(resume.current&&error.includes('Bật camera'))resume.current();else setRetry(v=>v+1);}}>Bật camera/micro</button>}
  {!error&&status&&['error','offline','unregistered'].includes(status.status)&&<button type="button" onClick={()=>{void studentApi.reconnectAi(attemptId).then(()=>setRetry(v=>v+1)).catch(()=>setError('Không kết nối được giám sát; hãy báo giảng viên.'));}}>Kết nối lại</button>}
  </div>}
 </div>;
}
