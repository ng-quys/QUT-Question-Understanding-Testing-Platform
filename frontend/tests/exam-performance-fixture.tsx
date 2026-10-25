import {ExamPerformance} from '../src/features/student/components/ExamPerformance';
import {recordExamRender} from '../src/features/student/services/examPerformance';
// Synthetic questions only. No student session, camera, backend or database calls.
import {Profiler,useCallback,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ExamRunner} from '../src/features/student/components/StudentWorkspace';
import type {StudentAttempt} from '../src/features/student/services/studentService';

const attempt={attemptId:1,examId:1,sessionId:1,examCode:'PERF-TEST',examTitle:'Đo cuộn và chọn đáp án · Dữ liệu giả',courseCode:'TEST',courseName:'Kiểm thử',endTime:'2099-01-01T10:00:00',questions:Array.from({length:30},(_,index)=>({questionId:index+1,position:index+1,content:`Câu hỏi giả ${index+1}: Chọn một phương án để đo tốc độ phản hồi của giao diện.`,points:1,selectedAnswerId:null,options:['A','B','C','D'].map((label,i)=>({id:index*4+i+1,label,content:`Phương án ${label} · Nội dung chỉ phục vụ đo hiệu năng, không phải đề thi thật.`}))}))} as StudentAttempt;
const quantile=(values:number[],fraction:number)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*fraction))]??0;};
function Fixture(){
  const [selected,setSelected]=useState<Record<number,number>>({}),[busy,setBusy]=useState(false),[result,setResult]=useState('Chưa đo');
  const commits=useRef<number[]>([]);
  const choose=useCallback((question:number,answer:number)=>setSelected(previous=>({...previous,[question]:answer})),[]);
  const measure=async(noBlur:boolean)=>{
    setBusy(true);setResult('Đang đo trên dữ liệu giả...');
    document.body.classList.toggle('perf-no-blur',noBlur);window.scrollTo({top:0,behavior:'instant'});
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    commits.current=[];const gaps:number[]=[],longTasks:number[]=[];
    const observer=PerformanceObserver.supportedEntryTypes.includes('longtask')?new PerformanceObserver(list=>{for(const entry of list.getEntries())longTasks.push(entry.duration);}):null;
    observer?.observe({type:'longtask'});
    const start=performance.now();let last=start,step=0;
    await new Promise<void>(resolve=>{
      const frame=(now:number)=>{
        gaps.push(now-last);last=now;
        const max=Math.max(0,document.documentElement.scrollHeight-innerHeight);
        window.scrollTo({top:Math.abs(Math.sin((now-start)/800))*Math.min(max,6000),behavior:'instant'});
        if(step++%12===0){const question=Math.floor(step/12)%attempt.questions.length;choose(question+1,attempt.questions[question].options[step%4].id);}
        if(now-start<5000)requestAnimationFrame(frame);else resolve();
      };requestAnimationFrame(frame);
    });
    observer?.disconnect();window.scrollTo({top:0,behavior:'instant'});
    setResult(JSON.stringify({mode:noBlur?'opaque':'blur',frames:gaps.length,frameP95Ms:+quantile(gaps,.95).toFixed(2),frameMaxMs:+Math.max(...gaps).toFixed(2),framesOver33ms:gaps.filter(value=>value>33.5).length,longTasks:longTasks.length,reactCommits:commits.current.length,reactP95Ms:+quantile(commits.current,.95).toFixed(2)},null,2));setBusy(false);
  };
  return <main className="student-workspace" style={{padding:'12px 28px'}}><style>{'.perf-no-blur .student-exam-toolbar{backdrop-filter:none!important;background:#f5f7fb!important}.perf-controls{position:fixed;bottom:8px;left:8px;z-index:200;background:white;border:1px solid #aaa;padding:10px;max-width:360px;font:13px monospace}.perf-controls button{margin:4px;padding:6px}'}</style><ExamPerformance/><aside className="perf-controls"><strong>Kiểm thử độc lập · Không ghi dữ liệu thật</strong><div><button disabled={busy} onClick={()=>void measure(false)}>Đo nền mờ</button><button disabled={busy} onClick={()=>void measure(true)}>Đo nền đặc</button></div><pre role="status" style={{whiteSpace:'pre-wrap'}}>{result}</pre></aside><Profiler id="exam-fixture" onRender={(_id,_phase,duration)=>{commits.current.push(duration);recordExamRender(_id,_phase,duration);}}><ExamRunner attempt={attempt} selected={selected} remaining="00:50:00" savingQuestion={null} submitting={false} expired={false} violationCount={0} fullscreenActive onChoose={choose} onSubmit={()=>{}} onFullscreen={()=>{}}/></Profiler></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
