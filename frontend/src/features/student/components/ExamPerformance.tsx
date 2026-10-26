import {useEffect,useState} from 'react';
import {examPerformanceSnapshot,startExamPerformance} from '../services/examPerformance';

/** Development only, F9 toggles measurement without leaving the exam window. */
export function ExamPerformance(){
  const [active,setActive]=useState(false),[sample,setSample]=useState(examPerformanceSnapshot);
  useEffect(()=>{
    const toggle=(event:KeyboardEvent)=>{if(event.key==='F9'&&!event.repeat){event.preventDefault();setActive(value=>!value);}};
    window.addEventListener('keydown',toggle);return()=>window.removeEventListener('keydown',toggle);
  },[]);
  useEffect(()=>{if(!active)return;const stop=startExamPerformance();const timer=setInterval(()=>setSample(examPerformanceSnapshot()),1000);return()=>{stop();clearInterval(timer);};},[active]);
  if(!active)return null;
  return <aside aria-label="Chẩn đoán hiệu năng" style={{position:'fixed',right:12,bottom:12,zIndex:300,padding:'10px 14px',border:'1px solid #a8bbd4',borderRadius:8,background:'#fff',color:'#173354',font:'12px/1.65 monospace',pointerEvents:'none'}}><strong>Đang đo · F9 để tắt</strong><div>Khoảng khung hình P95: {sample.frameP95} ms</div><div>Khung hình chậm: {sample.slowFrames}/{sample.frames}</div><div>Tác vụ dài: {sample.longTasks} · Dài nhất: {sample.longestTask} ms</div><div>Phản hồi thao tác P95: {sample.inputSamples?`${sample.inputP95} ms`:'Chưa có mẫu ≥16 ms'}</div><div>React P95: {sample.renderP95} ms</div><div>Nén ảnh P95: {sample.cameraP95} ms</div><small>Đo cục bộ · Không gửi dữ liệu lên máy chủ</small></aside>;
}
