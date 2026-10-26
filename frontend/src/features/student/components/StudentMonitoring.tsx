import {recordExamWork} from '../services/examPerformance';
import { LiveFrameDelivery } from '../services/liveFrameDelivery';
import { monitorJpeg } from '../services/monitorJpeg';
import { useEffect, useRef, useState } from 'react';
import { errorMessageVi } from '@shared/services/errorMessages';
import './StudentMonitoring.css';
import { studentApi, type AiStatus, type CameraHealth } from '../services/studentService';
import { appendMonitorAudio, monitorFrameSize } from '../services/monitorMedia';
import { examCamera, type CameraLease } from '../services/examCamera';
import { CameraSignal } from '../services/cameraSignal';
import { cameraPicturePresent } from '../services/cameraPicture';
import { cameraMustPause } from '../services/cameraGate';

const encode=(bytes:Uint8Array)=>{let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);};
const cameraMessage='Camera không có hình. Hãy kiểm tra camera để tiếp tục thi.';
export function StudentMonitoring({attemptId,onCameraGate,onUnavailable,required}:{attemptId:number;required?:boolean;onUnavailable?:(value:boolean)=>void;onCameraGate?:(blocked:boolean,message:string)=>void}){
 const [error,setError]=useState(''),[audioError,setAudioError]=useState('');
 const video=useRef<HTMLVideoElement>(null),retryCamera=useRef<()=>void>(()=>{}),retryAudio=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let disposed=false,lease:CameraLease|undefined,mic:MediaStream|undefined,audio:AudioContext|undefined,node:AudioWorkletNode|undefined,source:MediaStreamAudioSourceNode|undefined;
  let timer:ReturnType<typeof setTimeout>|undefined,frameTimer:ReturnType<typeof setTimeout>|undefined,healthTimer:ReturnType<typeof setTimeout>|undefined;
  let latest:AiStatus|null=null,health:CameraHealth|null=null,deviceStarting=false,audioStarting=false,nextCameraTry=0;
  let frameFailed=false,polling=false,connectionEpoch=0;
  const delivery=new LiveFrameDelivery();
  let pcm=new Uint8Array(),pcmAt=0,lastPicture=0,picture=false,reported:string|undefined;
  let cameraPermission:PermissionStatus|undefined,backendReachable=navigator.onLine!==false;
  const signal=new CameraSignal(),abort=new AbortController(),element=video.current;
  const canvas=document.createElement('canvas'),thumbnail=document.createElement('canvas');thumbnail.width=32;thumbnail.height=24;
  setError('');setAudioError('');
  const cleanupAudio=()=>{mic?.getTracks().forEach(track=>track.stop());node?.disconnect();source?.disconnect();if(audio)void audio.close().catch(()=>{});mic=undefined;audio=undefined;node=undefined;source=undefined;pcm=new Uint8Array();pcmAt=0;};
  const cleanupCamera=()=>{lease?.release();lease=undefined;if(element)element.srcObject=null;};
  const available=()=>{
    if(cameraPermission?.state==='denied'||!lease||!lease.stream.getVideoTracks().some(track=>track.readyState==='live'&&track.enabled&&!track.muted)||!element||element.readyState<2)return false;
    if(Date.now()-lastPicture>=500){
      lastPicture=Date.now();
      try{const ctx=thumbnail.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(element,0,0,32,24);picture=cameraPicturePresent(ctx.getImageData(0,0,32,24).data);}catch{picture=false;}
    }
    return picture;
  };
  const gate=()=>{
    if(!(latest?.required??required))return;
    const missing=signal.observe(available(),Date.now());
    onCameraGate?.(cameraMustPause(missing,health,backendReachable),missing?(cameraPermission?.state==='denied'?'Quyền truy cập camera bị chặn. Hãy cấp lại quyền để tiếp tục thi.':cameraMessage):health?.cameraMessage??'');
  };
  async function microphone(){
    if(disposed||audioStarting)return;audioStarting=true;
    try{
      cleanupAudio();
      const acquired=await navigator.mediaDevices.getUserMedia({video:false,audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
      if(disposed){acquired.getTracks().forEach(track=>track.stop());return;}mic=acquired;
      audio=new AudioContext();await audio.audioWorklet.addModule(`${import.meta.env.BASE_URL}monitor-audio-worklet.js`);
      if(disposed){cleanupAudio();return;}
      source=audio.createMediaStreamSource(mic);node=new AudioWorkletNode(audio,'qut-monitor-audio');
      const silent=audio.createGain();silent.gain.value=0;source.connect(node);node.connect(silent);silent.connect(audio.destination);
      node.port.onmessage=event=>{if(!disposed&&latest?.captureAllowed){pcm=appendMonitorAudio(pcm,new Uint8Array(event.data));pcmAt=Date.now();}};
      node.port.postMessage(Boolean(latest?.captureAllowed));
      for(const track of mic.getAudioTracks())track.onended=()=>{if(!disposed){pcm=new Uint8Array();setAudioError('Micro bị ngắt. Bật lại micro để tiếp tục giám sát âm thanh.');}};
      await audio.resume();
      if(!disposed)setAudioError(audio.state==='running'?'':'Trình duyệt chưa bật âm thanh. Nhấn “Bật micro”.');
    }catch{if(!disposed){cleanupAudio();setAudioError('Micro chưa bật. Bạn vẫn có thể làm bài; camera vẫn được giám sát.');}}
    finally{audioStarting=false;}
  }
  async function devices(){
    if(disposed||deviceStarting||Date.now()<nextCameraTry)return;
    if(lease?.stream.getVideoTracks().some(track=>track.readyState==='live'&&track.enabled&&!track.muted))return;
    deviceStarting=true;
    try{
      cleanupCamera();const acquired=await examCamera.acquire();if(disposed){acquired.release();return;}
      lease=acquired;lastPicture=0;
      if(element){element.srcObject=lease.stream;await element.play();}
      if(!disposed)setError('');
    }catch(cause){if(!disposed){nextCameraTry=Date.now()+3000;setError(errorMessageVi(cause,{fallback:'Không truy cập được camera. Hãy bật quyền camera và kết nối lại.'}));}}
    finally{deviceStarting=false;}
  }
  retryCamera.current=()=>{nextCameraTry=0;void devices();};
  retryAudio.current=()=>{if(audio?.state==='suspended')void audio.resume().then(()=>setAudioError('')).catch(()=>setAudioError('Chưa bật được micro.'));else void microphone();};
  async function report(){
    try{
      if(backendReachable&&navigator.onLine!==false&&latest?.required){const present=available();health=await studentApi.cameraHealth(attemptId,present,AbortSignal.any([abort.signal,AbortSignal.timeout(6000)]),!present&&cameraPermission?.state==='denied'?'permission_denied':'device_unavailable');if(!disposed)gate();}
    }catch{ /* Connection recovery handles network loss; a failed request is not proof the camera stopped. */ }
  }
  const disconnected=()=>{
    backendReachable=false;connectionEpoch++;
    if(latest)latest={...latest,captureAllowed:false};
    node?.port.postMessage(false);pcm=new Uint8Array();pcmAt=0;
    onUnavailable?.(true);gate();
  };
  const poll=async()=>{
    if(disposed||polling)return;
    if(navigator.onLine===false){disconnected();timer=setTimeout(poll,5000);return;}
    polling=true;
    try{
      const value=await studentApi.aiStatus(attemptId,AbortSignal.any([abort.signal,AbortSignal.timeout(6000)]));if(disposed)return;
      latest=value;if(value.status==='waiting')frameFailed=false;onUnavailable?.(frameFailed||['offline','error','starting','unregistered'].includes(value.status));backendReachable=true;
      if(typeof value.cameraVerified==='boolean')health={cameraVerified:value.cameraVerified,cameraReason:value.cameraReason??'',cameraMessage:value.cameraMessage??''};
      if(value.required&&value.status!=='stopped'){
        void devices();if(!mic&&!audioStarting&&!audioErrorStarted){audioErrorStarted=true;void optionalMicrophone();}
        gate();
      }
      node?.port.postMessage(Boolean(value.captureAllowed));if(!value.captureAllowed){pcm=new Uint8Array();pcmAt=0;}
      if(value.status==='stopped'||!value.required){cleanupAudio();cleanupCamera();setAudioError('');setError('');onCameraGate?.(false,'');}
    }catch{if(!disposed)disconnected();}
    finally{polling=false;if(!disposed)timer=setTimeout(poll,backendReachable?1500:5000);}
  };
  async function optionalMicrophone(){
    try{
      const permission=await navigator.permissions?.query({name:'microphone' as PermissionName});
      if(disposed)return;
      if(permission?.state==='granted'){void microphone();return;}
    }catch{ /* Ask only when the student explicitly chooses the optional microphone. */ }
    if(!disposed)setAudioError('Micro đang tắt (tùy chọn). Camera vẫn được giám sát.');
  }
  let audioErrorStarted=false;
  const send=async()=>{
    const outcome=await delivery.run({
      current:()=>!disposed&&backendReachable&&navigator.onLine!==false&&latest?.captureAllowed&&typeof latest.lease==='number'&&element&&available()?{lease:latest.lease,epoch:connectionEpoch}:undefined,
      capture:async()=>{
        const size=monitorFrameSize(element!.videoWidth,element!.videoHeight);
        if(canvas.width!==size.width||canvas.height!==size.height){canvas.width=size.width;canvas.height=size.height;}
        canvas.getContext('2d')!.drawImage(element!,0,0,size.width,size.height);
        const jpeg=await monitorJpeg(canvas,duration=>recordExamWork('camera',duration));
        const captured=audio?.state==='running'&&mic?.getAudioTracks().some(track=>track.readyState==='live'&&!track.muted)&&Date.now()-pcmAt<1500?pcm:new Uint8Array();
        pcm=new Uint8Array();pcmAt=0;
        return {jpeg,audioPcm16:encode(captured)};
      },
      send:(turn,frame)=>studentApi.aiFrame(attemptId,{...frame,lease:turn.lease},AbortSignal.any([abort.signal,AbortSignal.timeout(6000)])),
    });
    if(disposed)return;
    if(outcome==='sent'){frameFailed=false;onUnavailable?.(['offline','error','starting','unregistered'].includes(latest?.status??''));setError('');}
    else if(outcome==='failed'){frameFailed=true;onUnavailable?.(true);}
    frameTimer=setTimeout(send,backendReachable&&navigator.onLine!==false?Math.max(200,Math.min(1500,latest?.frameIntervalMs??250)):1000);
  };
  const heartbeat=async()=>{await report();if(!disposed)healthTimer=setTimeout(heartbeat,3000);};
  const watch=setInterval(()=>{
    if(disposed||!(latest?.required??required)||latest?.status==='stopped')return;
    const present=available(),reportKey=`${present}:${cameraPermission?.state??'unknown'}`;gate();
    if(reported!==reportKey){reported=reportKey;void report();}
  },250);
  // Only an explicit permission result identifies denied access; a dead track alone cannot.
  void navigator.permissions?.query({name:'camera' as PermissionName}).then(permission=>{
    if(disposed)return;cameraPermission=permission;
    permission.onchange=()=>{if(!disposed){reported=undefined;gate();void report();}};
  }).catch(()=>{});
  const reconnected=()=>{clearTimeout(timer);void poll();};
  window.addEventListener('offline',disconnected);window.addEventListener('online',reconnected);
  void poll();void send();healthTimer=setTimeout(heartbeat,3000);
  if(required)void devices();
  return()=>{disposed=true;window.removeEventListener('offline',disconnected);window.removeEventListener('online',reconnected);if(cameraPermission)cameraPermission.onchange=null;abort.abort();clearTimeout(timer);clearTimeout(frameTimer);clearTimeout(healthTimer);clearInterval(watch);retryCamera.current=()=>{};retryAudio.current=()=>{};cleanupAudio();cleanupCamera();};
 },[attemptId,onCameraGate,required]);
 // Connection retries are silent; only local camera failures need student action.
 const warning=Boolean(error);
 return <>
  <video ref={video} muted autoPlay playsInline aria-hidden="true" style={{position:'fixed',width:1,height:1,opacity:0,pointerEvents:'none',left:0,bottom:0}}/>
  {warning&&<div className="student-monitoring-compact needs-attention"><div className="student-monitoring-warning" role="alert">
   <strong>Cần kiểm tra camera</strong><p>{error} Thời gian thi vẫn tiếp tục.</p>
   {error&&<button type="button" onClick={()=>retryCamera.current()}>Kết nối camera</button>}
  </div></div>}
  {audioError&&<div className="student-monitoring-audio-option"><span>{audioError}</span><button type="button" onClick={()=>retryAudio.current()}>Bật micro (tùy chọn)</button></div>}
 </>;
}
