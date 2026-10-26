import { examCamera, type CameraLease } from '../services/examCamera';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CameraOff, CheckCircle2, Loader2, ShieldCheck, X } from 'lucide-react';
import { studentApi, type CameraCheck } from '../services/studentService';
import { monitorFrameSize } from '../services/monitorMedia';
import { errorMessageVi } from '@shared/services/errorMessages';
import './CameraPreflight.css';

const cameraAccessErrors:Record<string,string>={
  NotAllowedError:'Chưa có quyền truy cập camera. Hãy cấp quyền trong trình duyệt rồi nhấn “Kiểm tra lại”.',
  SecurityError:'Trình duyệt đang chặn camera. Hãy mở trang bằng HTTPS hoặc localhost rồi thử lại.',
  NotFoundError:'Không tìm thấy camera. Hãy kết nối camera rồi nhấn “Kiểm tra lại”.',
  NotReadableError:'Không thể mở camera. Hãy kiểm tra kết nối và các ứng dụng đang sử dụng camera rồi thử lại.',
};
const verificationHints:Record<string,{title:string;description:string}>={
  no_face:{title:'Chưa thấy khuôn mặt',description:'Hãy nhìn vào camera, mở nắp che và giữ khuôn mặt trong khung hình.'},
  face_unclear:{title:'Khuôn mặt chưa rõ',description:'Hãy điều chỉnh ánh sáng và khoảng cách để khuôn mặt rõ hơn.'},
  invalid_image:{title:'Hình ảnh camera chưa rõ',description:'Hãy kiểm tra camera, điều chỉnh ánh sáng rồi thử lại.'},
  identity_mismatch:{title:'Khuôn mặt chưa khớp ảnh hồ sơ',description:'Hãy nhìn thẳng vào camera, giữ khuôn mặt rõ và kiểm tra ảnh hồ sơ.'},
  liveness_failed:{title:'Chưa xác nhận được khuôn mặt thật',description:'Hãy nhìn thẳng vào camera và điều chỉnh ánh sáng để kiểm tra lại.'},
  reference_invalid:{title:'Cần kiểm tra ảnh hồ sơ',description:'Ảnh hồ sơ cần có khuôn mặt rõ ràng. Hãy kiểm tra ảnh hoặc liên hệ đơn vị quản lý.'},
  busy:{title:'Dịch vụ xác minh đang bận',description:'Vui lòng giữ camera mở. Hệ thống sẽ tự thử lại.'},
  ai_unavailable:{title:'Dịch vụ xác minh chưa sẵn sàng',description:'Vui lòng chờ một chút hoặc nhấn “Kiểm tra lại”.'},
};

export function CameraPreflight({sessionId,hasPhoto,onReady,onClose,onProfile,clockOffsetMs=0,api=studentApi}:{sessionId:number;hasPhoto:boolean;onReady:(token:string|null)=>Promise<void>;onClose:()=>void;onProfile:()=>void;clockOffsetMs?:number;api?:Pick<typeof studentApi,'cameraRequirements'|'checkCamera'>}) {
  const dialog=useRef<HTMLDialogElement>(null),video=useRef<HTMLVideoElement>(null);
  const stream=useRef<MediaStream|null>(null),shutdown=useRef<(handoff?:boolean)=>void>(()=>{});
  const [check,setCheck]=useState<CameraCheck|null>(null),[required,setRequired]=useState<boolean|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[starting,setStarting]=useState(false),[now,setNow]=useState(Date.now());
  const [errorTone,setErrorTone]=useState<'warning'|'error'>('warning');
  useEffect(()=>{dialog.current?.showModal();const timer=setInterval(()=>setNow(Date.now()),250);return()=>{clearInterval(timer);dialog.current?.close();};},[]);
  useEffect(()=>{
    let disposed=false,timer:ReturnType<typeof setTimeout>|undefined,lease:CameraLease|undefined;
    const abort=new AbortController();
    const stop=(handoff=false)=>{disposed=true;abort.abort();clearTimeout(timer);lease?.release(handoff);stream.current=null;};
    shutdown.current=stop;setCheck(null);setError('');setErrorTone('warning');setRequired(null);
    const available=()=>!!stream.current&&stream.current.getVideoTracks().some(track=>track.readyState==='live'&&track.enabled&&!track.muted);
    async function inspect(){
      if(disposed)return;
      const started=performance.now();
      try{
        if(!available()||!video.current||video.current.readyState<2){setCheck(null);setErrorTone('warning');setError('Camera chưa có tín hiệu. Hãy mở camera và kết nối lại.');}
        else {
          const canvas=document.createElement('canvas'),size=monitorFrameSize(video.current.videoWidth,video.current.videoHeight);
          canvas.width=size.width;canvas.height=size.height;
          canvas.getContext('2d')!.drawImage(video.current,0,0,size.width,size.height);
          const jpeg=canvas.toDataURL('image/jpeg',.85).split(',')[1];
          const value=await api.checkCamera(sessionId,jpeg,AbortSignal.any([abort.signal,AbortSignal.timeout(15000)]));
          if(!disposed){if(available()){setCheck(value);setError('');}else{setCheck(null);setErrorTone('warning');setError('Camera đã bị tắt. Hãy bật lại và kiểm tra lại.');}}
        }
      }catch(cause){if(!disposed){setCheck(null);setErrorTone('warning');setError(errorMessageVi(cause,{fallback:'Chưa xác minh được camera. Vui lòng thử lại.'}));}}
      finally{if(!disposed)timer=setTimeout(inspect,Math.max(50,800-(performance.now()-started)));}
    }
    async function begin(){
      try{
        const value=await api.cameraRequirements(sessionId,AbortSignal.any([abort.signal,AbortSignal.timeout(10000)]));
        if(disposed)return;
        setRequired(value.required);
        if(!value.required){setCheck({required:false,verified:true,reason:'disabled',message:'Ca thi không yêu cầu giám sát camera.',verificationToken:null,expiresAt:0});return;}
        if(!hasPhoto)return;
        lease=await examCamera.acquire();
        if(disposed){lease.release();return;}
        const media=lease.stream;stream.current=media;
        for(const track of media.getTracks()){
          const interrupted=()=>{if(!disposed){setCheck(null);setErrorTone('warning');setError('Camera đã bị tắt. Hãy bật lại và kiểm tra lại.');}};
          track.addEventListener('ended',interrupted);track.addEventListener('mute',interrupted);
        }
        if(video.current){video.current.srcObject=media;await video.current.play();}
        void inspect();
      }catch(cause){if(!disposed){const name=cause instanceof Error?cause.name:'';setErrorTone(cameraAccessErrors[name]?'error':'warning');setError(cameraAccessErrors[name]??errorMessageVi(cause,{fallback:'Không truy cập được camera.'}));}}
    }
    void begin();return stop;
  },[sessionId,hasPhoto,retry,api]);
  const mediaLive=required===false||!!stream.current&&stream.current.getVideoTracks().some(track=>track.readyState==='live'&&track.enabled&&!track.muted);
  const ready=Boolean(mediaLive&&check?.verified&&!error&&(required===false||check.expiresAt>now+clockOffsetMs));
  async function start(){
    if(!ready||starting)return;
    setStarting(true);shutdown.current(true);
    try{await onReady(check?.verificationToken??null);}
    catch(cause){setErrorTone('warning');setError(errorMessageVi(cause,{fallback:'Chưa thể mở bài thi. Vui lòng kiểm tra lại.'}));setStarting(false);setRetry(value=>value+1);}
  }
  const needsPhoto=required===true&&!hasPhoto;
  const hint=check&&!check.verified?verificationHints[check.reason]:undefined;
  const tone=starting?'checking':needsPhoto?'warning':ready?'verified':error?errorTone:hint?'warning':'checking';
  const title=starting?'Đang mở bài thi…':needsPhoto?'Chưa có ảnh khuôn mặt':ready?'Xác minh thành công. Bạn có thể vào thi.':error?(errorTone==='error'?'Không truy cập được camera':'Chưa thể xác minh'):hint?.title??'Đang kiểm tra khuôn mặt…';
  const description=starting?'Vui lòng chờ trong giây lát.':needsPhoto?'Vui lòng cập nhật ảnh hồ sơ trước khi xác minh vào thi.':ready?'Camera và khuôn mặt đã được xác minh.':error||hint?.description||'Nhìn thẳng vào camera, giữ khuôn mặt rõ và đủ sáng để đối chiếu ảnh hồ sơ.';
  const StatusIcon=tone==='verified'?CheckCircle2:tone==='warning'?AlertTriangle:tone==='error'?CameraOff:Loader2;
  return <dialog ref={dialog} className="camera-preflight" aria-labelledby="camera-preflight-title" onCancel={event=>{event.preventDefault();if(!starting)onClose();}}>
    <header><div><span>KIỂM TRA TRƯỚC KHI THI</span><h2 id="camera-preflight-title">Xác minh camera và khuôn mặt</h2></div><button type="button" className="camera-preflight-close" disabled={starting} aria-label="Đóng kiểm tra camera" onClick={onClose}><X size={20}/></button></header>
    <div className="camera-preflight-body">
      {required!==false&&<div className="camera-preflight-preview"><video ref={video} muted autoPlay playsInline aria-label="Hình ảnh camera của bạn"/>{(!hasPhoto||required===null)&&<div><Camera size={36}/><span>{required===null?'Đang kiểm tra yêu cầu ca thi…':'Cần ảnh tham chiếu trước khi xác minh'}</span></div>}</div>}
      <div className={`camera-preflight-status ${tone}`} role="status" aria-live="polite" aria-atomic="true">
        <StatusIcon size={22} className={tone==='checking'?'animate-spin':undefined}/>
        <div><strong>{title}</strong><p>{description}</p>{needsPhoto&&<button type="button" onClick={onProfile}>Đến hồ sơ</button>}</div>
      </div>
      {required&&<ul className="camera-preflight-rules"><li>Camera hoạt động và có hình ảnh.</li><li>Khuôn mặt của bạn khớp với ảnh hồ sơ hiện tại.</li><li>Kiểm tra người thật trên nhiều khung hình liên tiếp.</li></ul>}
      <p className="camera-preflight-note">Đáp án đã chọn được giữ lại khi kiểm tra lại. Thời gian thi tính theo lịch ca và vẫn tiếp tục chạy.</p>
    </div>
    <footer><button type="button" className="student-button secondary" disabled={starting} onClick={()=>setRetry(value=>value+1)}>Kiểm tra lại</button><button type="button" className="student-button primary" disabled={!ready||starting} onClick={()=>void start()}>{starting?<Loader2 size={17} className="animate-spin"/>:<ShieldCheck size={17}/>}Tiếp tục vào thi</button></footer>
  </dialog>;
}
