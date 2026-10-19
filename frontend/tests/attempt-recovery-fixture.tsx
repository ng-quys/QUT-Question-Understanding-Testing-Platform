import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AttemptRecovery,indexedDraftStore,type RecoveryState} from '../src/features/student/services/attemptRecovery';
import {AttemptSyncNotice} from '../src/features/student/components/AttemptSyncNotice';
import {ExamRunner} from '../src/features/student/components/StudentWorkspace';
import type {StudentAttempt} from '../src/features/student/services/studentService';

const owner='fixture-offline-student-v1',attemptId=987654321,serverKey='examflow-recovery-fixture-server';
const serverAnswers=()=>JSON.parse(localStorage.getItem(serverKey)||'{}') as Record<number,number>;
const questions=[{questionId:1,position:1,content:'Mạng bị ngắt khi đang làm bài. Đáp án được giữ ở đâu trước khi đồng bộ?',points:5,selectedAnswerId:null,options:[{id:11,label:'A',content:'IndexedDB trên trình duyệt của sinh viên'},{id:12,label:'B',content:'Không lưu được ở đâu'}]},{questionId:2,position:2,content:'Khi kết nối trở lại, bài làm được xử lý như thế nào?',points:5,selectedAnswerId:null,options:[{id:21,label:'A',content:'Tạo lượt thi mới và tính lại thời gian'},{id:22,label:'B',content:'Đồng bộ và tiếp tục đúng lượt thi đang làm'}]}];
const attempt:StudentAttempt={attemptId,sessionId:987654321,examId:987654321,examCode:'OFFLINE-TEST',examTitle:'Kiểm thử khôi phục bài thi',courseCode:'TEST',courseName:'Dữ liệu kiểm thử',durationMinutes:60,totalPoints:10,startedAt:'2030-10-19T08:00:00+07:00',endTime:'2030-10-19T09:00:00+07:00',status:'in_progress',questions};
function Fixture(){
 const ref=useRef<AttemptRecovery|null>(null),connected=useRef(false);
 const [online,setOnline]=useState(false),[selected,setSelected]=useState<Record<number,number>>({}),[restored,setRestored]=useState(0),[confirmed,setConfirmed]=useState(serverAnswers()),[ready,setReady]=useState(false),[submitted,setSubmitted]=useState(false);
 const [state,setState]=useState<RecoveryState>({pending:[],localSaving:false,storageError:false,syncing:false,syncError:false});
 useEffect(()=>{
  const data={...attempt,questions:questions.map(q=>({...q,selectedAnswerId:serverAnswers()[q.questionId]??null}))};
  const recovery=new AttemptRecovery({owner,attempt:data,deadline:Date.parse(attempt.endTime),online:()=>connected.current,onChange:setState,
   send:async(q,a)=>{if(!connected.current)throw new Error('Synthetic network unavailable');const saved={...serverAnswers(),[q]:a};localStorage.setItem(serverKey,JSON.stringify(saved));setConfirmed(saved);}
  });ref.current=recovery;
  void recovery.restore().then(result=>{setSelected(result.selected);setRestored(result.restored);setReady(true);});
  return()=>recovery.stop();
 },[]);
 return <main className="student-workspace" style={{padding:28}}><div style={{maxWidth:1240,margin:'auto'}}><header style={{marginBottom:20}}><h1>Kiểm thử lưu bài khi mất mạng</h1><p>Dữ liệu tổng hợp, không gửi đến API thi thật. IndexedDB là bộ nhớ thật của trình duyệt.</p><div style={{display:'flex',gap:12,marginTop:15}}><button onClick={()=>{connected.current=!connected.current;setOnline(connected.current);if(connected.current)void ref.current?.flush();}}>{online?'Mô phỏng mất mạng':'Khôi phục kết nối'}</button><button onClick={()=>location.reload()}>Tải lại trang kiểm thử</button><button onClick={async()=>{ref.current?.stop();await indexedDraftStore.clear(owner,attemptId);localStorage.removeItem(serverKey);location.reload();}}>Đặt lại dữ liệu kiểm thử</button></div></header>
  <p role="status">{ready?`Đã khôi phục ${restored} đáp án chưa đồng bộ`:'Đang mở bản lưu tạm…'}</p><p>Máy chủ mô phỏng đã nhận: {Object.keys(confirmed).length} câu</p>
  <AttemptSyncNotice state={state} online={online} expired={false} onRetry={()=>void ref.current?.flush()}/>
  {submitted?<h2>Đã xác nhận nộp bài và xóa bản lưu tạm</h2>:ready&&<ExamRunner attempt={attempt} selected={selected} remaining="00:59:30" savingQuestion={state.syncing?state.pending[0]??null:null} pendingQuestions={state.syncing?state.pending:[]} failedQuestions={state.pending} onChoose={(q,a)=>{if(ref.current?.choose(q,a))setSelected(old=>({...old,[q]:a}));}} onSubmit={async()=>{if(!connected.current)return;await ref.current?.prepareSubmit();localStorage.setItem(serverKey,JSON.stringify(selected));setConfirmed(selected);await ref.current?.complete();setSubmitted(true);}} submitting={false} violationCount={0} fullscreenActive={true} onFullscreen={()=>{}}/>}
 </div></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
