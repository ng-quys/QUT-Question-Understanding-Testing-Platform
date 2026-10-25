// Local UI regression fixture: uses generated media and fake API, never a real webcam/microphone.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CameraPreflight } from '../src/features/student/components/CameraPreflight';
import '../src/index.css';
import '../src/features/student/styles/student.css';
const mode=new URLSearchParams(location.search).get('mode')??'pass';
let calls=0,mediaCalls=0,stops=0;
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
  mediaCalls++;
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
  const draw=()=>{const c=canvas.getContext('2d')!;c.fillStyle='#eaf1fa';c.fillRect(0,0,640,480);c.fillStyle='#6b85aa';c.font='22px Arial';c.fillText('CAMERA GIẢ · KIỂM THỬ GIAO DIỆN',60,240);};draw();
  const timer=setInterval(draw,250),audio=new AudioContext(),destination=audio.createMediaStreamDestination();
  const media=new MediaStream([...canvas.captureStream(5).getVideoTracks(),...destination.stream.getAudioTracks()]);
  for(const track of media.getTracks()){
    const stop=track.stop.bind(track);track.stop=()=>{stops++;stop();clearInterval(timer);void audio.close().catch(()=>{});};
  }
  if(mode==='late')setTimeout(()=>{for(const track of media.getTracks()){track.stop();track.dispatchEvent(new Event('ended'));}},1200);
  return media;
}}});
const api={cameraRequirements:async()=>({required:mode!=='disabled'}),checkCamera:async()=>{
  calls++;await new Promise(resolve=>setTimeout(resolve,mode==='late'?3000:100));
  const verified=(mode==='pass'&&calls>=3)||mode==='late';
  return {required:true,verified,reason:verified?'verified':mode==='no-face'?'no_face':'checking',message:verified?'Camera và khuôn mặt đã được xác minh.':mode==='no-face'?'Chưa thấy khuôn mặt. Hãy mở camera.':'Đang kiểm tra các khung hình liên tiếp…',verificationToken:verified?'synthetic-proof':null,expiresAt:Date.now()+3000};
}};
function Fixture(){
  const [open,setOpen]=useState(true),[message,setMessage]=useState('Chưa mở bài thi');
  return <main style={{padding:30,fontFamily:'Segoe UI'}}><h1>Kiểm thử bước vào thi · Camera và API giả</h1><p>{message}</p><button onClick={()=>setOpen(true)}>Mở kiểm tra</button><button onClick={()=>setMessage(`Yêu cầu xác minh: ${calls}; mở media: ${mediaCalls}; track đã dừng: ${stops}`)}>Xem số lần gọi</button>{open&&<CameraPreflight sessionId={7} hasPhoto api={api} onReady={async()=>{setMessage('Đã nhận bằng chứng xác minh, chuyển sang mở bài thi.');setOpen(false);}} onClose={()=>setOpen(false)} onProfile={()=>setMessage('Đến hồ sơ')}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
