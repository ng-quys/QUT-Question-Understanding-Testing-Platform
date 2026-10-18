import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Brain, CheckCircle2, Layers, Cpu, Compass } from 'lucide-react';
import { QuestionItem, Course, CourseChapter, CourseCLO } from '../../../types';
import { MatrixKnowledgeUnit, MatrixSummaryStats } from '../../matrix/types';
import {createAiJob,getAiJob,cancelAiJob,aiTerminal,quotaChanged,type AiJob} from '../services/aiCreditsService';

interface MatrixGenerationProgressProps {
  courseId: string;
  totalQuestions: number;
  units: MatrixKnowledgeUnit[];
  summary: MatrixSummaryStats;
  aiInstruction: string;
  defaultScore?: number;
  courses: Course[];
  chapters: CourseChapter[];
  clos: CourseCLO[];
  onComplete: (questions: QuestionItem[], charged:number, requested:number) => void;
  idempotencyKey: string;
  sourceProof?: string;
  resumeJobId?: number;
  onCancel: () => void;
  sourceText: string;
  provider: 'openai' | 'qwen';
}

export const MatrixGenerationProgress: React.FC<MatrixGenerationProgressProps> = ({
  courseId,
  totalQuestions,
  units,
  summary,
  aiInstruction,
  defaultScore = 0.5,
  courses,
  chapters,
  clos,
  onComplete,
  onCancel,
  sourceText,
  provider,
  idempotencyKey,
  sourceProof,
  resumeJobId,
}) => {
  const [job,setJob]=useState<AiJob|null>(null);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const [cancelling,setCancelling]=useState(false);
  const callbacks=useRef({onComplete,onCancel});
  callbacks.current={onComplete,onCancel};
  const delivered=useRef(false);
  const knownJob=useRef<number|undefined>(resumeJobId);
  const course=courses.find(c=>c.id===courseId);
  const courseName=course ? course.code + ' - ' + course.name : 'Học phần của job';
  const currentUnitName='';
  const percent=job ? Math.round(job.accepted/Math.max(1,job.requested)*100) : 0;
  const messages:Record<string,string>={reserved:'Đã giữ chỗ credits',running:'Đang sinh và kiểm tra câu hỏi',cancel_requested:'Đang chờ tác vụ hiện tại dừng',unknown:'Cần Admin đối soát job; credits vẫn được giữ chỗ',partial:'Đã sinh một phần',succeeded:'Đã hoàn thành',failed:'Không có câu hợp lệ; đã hoàn giữ chỗ',cancelled:'Đã hủy và hoàn giữ chỗ'};
  const statusMessage=job ? messages[job.status] || job.status : 'Đang tạo job AI...';
  useEffect(()=>{
    let cancelled=false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const accept=(next:AiJob)=>{
      if(cancelled)return;
      knownJob.current=next.id;setJob(next);setError('');
      if(aiTerminal(next.status)){
        quotaChanged();
        if(next.questions.length && !delivered.current){
          delivered.current=true;
          callbacks.current.onComplete(next.questions.map((q,i)=>({
            id:'ai-job-'+next.id+'-'+i,courseId:String(next.courseId),chapterId:String(q.chapterId??''),
            topicId:'',cloId:String(q.cloId??''),bloom:q.bloom,content:q.content,
            options:q.options,correctIndex:q.correctIndex,explanation:q.explanation,
            status:'pending' as const,source:'ai' as const,updatedAt:'',default_score:next.defaultScore??defaultScore,
          })),next.charged,next.requested);
        }
      }else timer=setTimeout(poll,3000);
    };
    const poll=async()=>{
      try{accept(await getAiJob(knownJob.current!));}
      catch(e){if(!cancelled){setError(e instanceof Error?e.message:'Không tải được trạng thái job.');timer=setTimeout(poll,5000);}}
    };
    const start=async()=>{
      try{
        if(knownJob.current){await poll();return;}
        accept(await createAiJob({courseId:Number(courseId),provider,instruction:aiInstruction,
          sourceText,sourceProof,defaultScore,units:units.map(u=>({name:u.name,chapterId:Number(u.chapterId)||null,
            cloId:Number(u.cloId)||null,nb:u.nb,th:u.th,vd:u.vd}))},idempotencyKey));
      }catch(e){if(!cancelled){setError(e instanceof Error?e.message:'Không tạo được job.');quotaChanged();}}
    };
    void start();
    return ()=>{cancelled=true;if(timer)clearTimeout(timer);};
  },[idempotencyKey,resumeJobId,retry]);
  const cancel=async()=>{
    if(!job||cancelling)return;
    setCancelling(true);
    try{setJob(await cancelAiJob(job.id));}
    catch(e){setError(e instanceof Error?e.message:'Không gửi được yêu cầu hủy.');}
    finally{setCancelling(false);}
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center shadow-lg max-w-xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-200">
      {/* Animated AI Core */}
      <div
        className="relative mx-auto w-20 h-20 rounded-2xl flex items-center justify-center text-white shadow-xl"
        style={{ backgroundColor: 'var(--primary)' }}
      >
        <Sparkles className="w-10 h-10 animate-spin" style={{ animationDuration: '6s' }} />
        <div
          className="absolute -inset-2 rounded-2xl opacity-25 animate-ping pointer-events-none"
          style={{ backgroundColor: 'var(--primary)' }}
        ></div>
      </div>

      <div>
        <h3 className="text-xl font-bold text-slate-900 font-sans">
          AI Generator · {job?.requested ?? totalQuestions} câu hỏi
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Học phần: <strong className="text-slate-800">{courseName}</strong>
        </p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-slate-200/80">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-1"
            style={{
              width: `${percent}%`,
              backgroundColor: 'var(--primary)',
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
          </div>
        </div>
        <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
          <span className="flex items-center gap-1.5 text-slate-700">
            <Cpu className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
            {statusMessage}
          </span>
          <span className="text-indigo-700 font-mono font-bold">{percent}%</span>
        </div>
      </div>

      {/* Breakdown Badges */}
      {!resumeJobId && <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
        <div className="text-center">
          <div className="text-slate-500 text-[11px]">Nhận biết (NB)</div>
          <div className="font-bold text-emerald-700 text-sm mt-0.5">{summary.totalNB} câu ({summary.percentNB}%)</div>
        </div>
        <div className="text-center border-x border-slate-200">
          <div className="text-slate-500 text-[11px]">Thông hiểu (TH)</div>
          <div className="font-bold text-blue-700 text-sm mt-0.5">{summary.totalTH} câu ({summary.percentTH}%)</div>
        </div>
        <div className="text-center">
          <div className="text-slate-500 text-[11px]">Vận dụng (VD)</div>
          <div className="font-bold text-indigo-700 text-sm mt-0.5">{summary.totalVD} câu ({summary.percentVD}%)</div>
        </div>
      </div>}
      {job && <p className="text-xs text-slate-600">Hợp lệ: {job.accepted}/{job.requested} · Đã quyết toán: {job.charged} credits</p>}

      {currentUnitName && (
        <div className="text-xs text-slate-500 bg-indigo-50/70 border border-indigo-100 rounded-lg py-2 px-3 flex items-center justify-center gap-2">
          <Compass className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span className="truncate">Đang xử lý: <strong className="text-indigo-900">{currentUnitName}</strong></span>
        </div>
      )}

      {error && <div role="alert" className="text-sm text-red-700 bg-red-50 p-3 rounded">{error}. Kiểm tra cấu hình API và thử lại.</div>}
      {error && <button type="button" onClick={()=>setRetry(v=>v+1)} className="text-xs underline">Kiểm tra lại cùng job/key</button>}
      {(error || (job && (aiTerminal(job.status) || job.status==='unknown'))) && <button type="button" onClick={onCancel} className="block mx-auto text-xs underline">Về ma trận</button>}
      {/* Cancel button */}
      <div className="pt-2">
        <button
          type="button"
          disabled={!job || cancelling || aiTerminal(job.status)}
          onClick={()=>void cancel()}
          className="text-xs text-slate-400 hover:text-rose-600 transition-colors cursor-pointer underline"
        >
          {cancelling ? 'Đang gửi yêu cầu hủy...' : 'Yêu cầu hủy tác vụ'}
        </button>
      </div>
    </div>
  );
};
