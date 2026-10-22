// Isolated browser fixture: synthetic account/data; no exam API request is sent.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { saveAuthSession } from '../../frontend-shared/src/features/auth/services/authService';
import { StudentPortalPage } from '../src/features/student/pages/StudentPortalPage';
import { studentApi, type StudentAttempt, type StudentDashboard, type StudentSession } from '../src/features/student/services/studentService';

const scope='examflow-connection-fixture', id=987654322;
let network=true, rejectNext=false, starts=0, notify=()=>{};
const read=()=>JSON.parse(localStorage.getItem(scope)||'{}') as Record<number,number>;
const endTime=localStorage.getItem(scope+'-end')||new Date(Date.now()+30*60000).toISOString();
localStorage.setItem(scope+'-end',endTime);
const startTime=new Date(Date.parse(endTime)-60*60000).toISOString();
saveAuthSession({token:'synthetic-fixture-token',userId:id,username:scope,email:'fixture@example.invalid',fullName:'Sinh viên kiểm thử',role:'student'},false);
sessionStorage.setItem('access_token','synthetic-fixture-token');sessionStorage.setItem('access_expires_at',String(Date.now()+3600000));
const realFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
  const url=String(input);
  if(url.includes('/api/')){
    if(url.endsWith('/student/profile/photo'))return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#dce8f8"/></svg>',{headers:{'Content-Type':'image/svg+xml'}});
    throw new Error('Unexpected API call in isolated fixture');
  }
  return realFetch(input,init);
};
const available=()=>{if(!network)throw new Error('Synthetic offline connection');};
const session:StudentSession={sessionId:id,examId:id,examCode:'TEST',examTitle:'Ca thi kiểm thử kết nối',courseCode:'TEST',courseName:'Dữ liệu mô phỏng',roomCode:'TEST',startTime,endTime,sessionStatus:'published',registrationStatus:'registered',durationMinutes:60,questionCount:2,totalPoints:10,attemptId:null,attemptStatus:null,score:null,canStart:true,requiresAccessCode:false};
const attempt=():StudentAttempt=>({attemptId:id,sessionId:id,examId:id,examCode:'TEST',examTitle:session.examTitle,courseCode:'TEST',courseName:session.courseName,durationMinutes:60,totalPoints:10,startedAt:startTime,endTime,status:'in_progress',questions:[
  {questionId:1,position:1,content:'Đáp án cần được giữ lại khi mất kết nối.',points:5,selectedAnswerId:read()[1]??null,options:[{id:11,label:'A',content:'Giữ nguyên bài làm'},{id:12,label:'B',content:'Xóa bài làm'}]},
  {questionId:2,position:2,content:'Khi có mạng trở lại, tiếp tục lượt thi nào?',points:5,selectedAnswerId:read()[2]??null,options:[{id:21,label:'A',content:'Tạo lượt mới'},{id:22,label:'B',content:'Lượt đang làm'}]},
]});
studentApi.dashboard=async()=>{available();return {studentId:id,fullName:'Sinh viên kiểm thử',email:'fixture@example.invalid',department:'Dữ liệu mô phỏng',upcomingSessions:0,ongoingSessions:1,completedExams:0,averageScore:0,sessions:[session],recentResults:[]} satisfies StudentDashboard;};
studentApi.clock=async()=>{available();return {serverTime:new Date().toISOString()};};
studentApi.profile=async()=>({studentId:id,username:scope,email:'fixture@example.invalid',fullName:'Sinh viên kiểm thử',status:'active',hasFacePhoto:true});
studentApi.startExam=async()=>{available();starts++;notify();return attempt();};
studentApi.saveAnswer=async(_attemptId,question,answer)=>{available();if(rejectNext){rejectNext=false;network=false;notify();throw new Error('Synthetic save failure');}localStorage.setItem(scope,JSON.stringify({...read(),[question]:answer}));notify();return {message:'Saved in synthetic server'};};
studentApi.aiStatus=async()=>({required:false,ready:false,status:'disabled',message:'Synthetic fixture; camera is not used'});
function Fixture(){
  const [,render]=useState(0);notify=()=>render(n=>n+1);
  return <><header style={{display:'flex',alignItems:'center',gap:12,padding:12,background:'#eef3fa',fontFamily:'sans-serif',fontSize:13}}><strong>Kiểm thử riêng — không dùng dữ liệu thi thật</strong>
    <button onClick={()=>{network=false;window.dispatchEvent(new Event('offline'));notify();}}>Ngắt kết nối</button>
    <button onClick={()=>{network=true;window.dispatchEvent(new Event('online'));notify();}}>Kết nối lại</button>
    <button onClick={()=>{rejectNext=true;notify();}}>Chặn lần lưu tiếp theo</button>
    <span data-testid="fixture-state">{network?'Có mạng':'Mất mạng'} · Mã lượt {id} · Mở lượt {starts} lần · Máy chủ nhận {Object.keys(read()).length} câu</span>
  </header><BrowserRouter><StudentPortalPage/></BrowserRouter></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
