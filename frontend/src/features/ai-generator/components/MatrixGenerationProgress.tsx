import {useEffect,useRef,useState} from 'react';
import type {Course,QuestionItem,InferenceBatchSize} from '@shared/types';
import {createAiJob,getAiJob,cancelAiJob,aiTerminal,quotaChanged,type AiJob} from '@shared/features/ai-generator/services/aiCreditsService';
interface Props {
 courseId:string;totalQuestions:number;cloIds:number[];courses:Course[];idempotencyKey:string;
 inferenceBatchSize:InferenceBatchSize;
 sourceProof?:string;resumeJobId?:number;sourceText:string;storageKey:string;
 documentRefs?:Array<{documentId:string;revision:number;indexId:string;configHash:string}>;
 onComplete:(questions:QuestionItem[],charged:number,requested:number,selectedClos?:Array<{id:number;code:string}>)=>void;
 onCancel:()=>void;
}
// Historical filename retained; the generator no longer accepts a matrix.
export function MatrixGenerationProgress(props:Props){
 const [job,setJob]=useState<AiJob|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[cancelling,setCancelling]=useState(false);
 const callbacks=useRef(props);callbacks.current=props;
 const creation=useRef<Promise<AiJob>|null>(null);
 const knownJob=useRef(props.resumeJobId),delivered=useRef(false);
 useEffect(()=>{
   let disposed=false,failures=0;let timer:ReturnType<typeof setTimeout>|undefined;
   const accept=(next:AiJob)=>{
     if(disposed)return;failures=0;knownJob.current=next.id;setJob(next);setError('');
     if(props.storageKey)sessionStorage.setItem(props.storageKey,String(next.id));
     if(aiTerminal(next.status)){
       quotaChanged();
       if(!delivered.current){delivered.current=true;callbacks.current.onComplete(next.questions.map((q,i)=>({
         id:`ai-job-${next.id}-${i}`,courseId:String(next.courseId),chapterId:String(q.chapterId??''),topicId:'',cloId:String(q.cloId??''),
         bloom:q.bloom,content:q.content,options:q.options,correctIndex:q.correctIndex,explanation:q.explanation,evidenceQuote:q.evidenceQuote,duplicateWarning:q.duplicateWarning,
         status:'pending',source:'ai',updatedAt:'',default_score:next.defaultScore??0.5,
       })),next.charged,next.requested,next.selectedClos);}
     }else if(next.status!=='unknown')timer=setTimeout(poll,3000);
   };
   const poll=async()=>{try{accept(await getAiJob(knownJob.current!));}catch(e){if(!disposed){setError(e instanceof Error?e.message:'Không đọc được job');if(++failures<4)timer=setTimeout(poll,5000*2**(failures-1));}}};
   const start=async()=>{try{
     if(knownJob.current){await poll();return;}
     if(!creation.current)creation.current=createAiJob({courseId:Number(props.courseId),provider:'qwen',sourceText:props.documentRefs?.length?undefined:props.sourceText,sourceProof:props.documentRefs?.length?undefined:props.sourceProof,documentRefs:props.documentRefs,
       questionCount:props.totalQuestions,cloIds:props.cloIds,defaultScore:0.5,batchSize:5,inferenceBatchSize:props.inferenceBatchSize},props.idempotencyKey);
     accept(await creation.current);
   }catch(e){if(!disposed){setError(e instanceof Error?e.message:'Không tạo được job');}}};
   void start();return()=>{disposed=true;if(timer)clearTimeout(timer);};
 },[props.idempotencyKey,props.resumeJobId,retry]);
 const cancel=async()=>{if(!job||cancelling)return;setCancelling(true);try{setJob(await cancelAiJob(job.id));}catch(e){setError(e instanceof Error?e.message:'Không hủy được job');}finally{setCancelling(false);}};
 const percent=job?Math.round(job.accepted/Math.max(1,job.requested)*100):0;
 const messages:Record<string,string>={reserved:'Đã xếp hàng và giữ chỗ credits',running:'Đang xử lý từng batch và lưu checkpoint',cancel_requested:'Đang chờ batch hiện tại dừng',unknown:'Cần Admin đối soát; credits vẫn được giữ chỗ'};
 return <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-xl mx-auto space-y-5 text-center">
   <h2 className="font-semibold text-lg">Đang sinh câu hỏi theo tài liệu và CLO</h2>
   <p className="text-sm text-slate-500">{error&&!job?'Chưa tạo được job AI. Hãy thử lại khi dịch vụ sẵn sàng.':messages[job?.status??'']||'Đang tạo job AI…'}</p>
   {job&&<><div role="progressbar" aria-label="Câu hỏi hợp lệ" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-[#172b4d]" style={{width:`${percent}%`}}/></div>
   <p className="text-sm">Hợp lệ: {job?.accepted??0}/{job?.requested??props.totalQuestions} · Đã quyết toán: {job?.charged??0} credits</p></>}
   {job&&job.totalBatches>1&&<p className="text-xs text-slate-500">Batch {Math.min(job.completedBatches+1,job.totalBatches)}/{job.totalBatches} · Lưu sau mỗi {job.batchSize} câu hợp lệ</p>}
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
   {(error||job?.status==='unknown')&&<button onClick={()=>{if(!knownJob.current)creation.current=null;setError('');setRetry(v=>v+1);}} className="underline text-sm">Thử lại cùng job/key</button>}
   {job&&!aiTerminal(job.status)&&job.status!=='unknown'&&<button disabled={cancelling} onClick={()=>void cancel()} className="underline text-sm">{cancelling?'Đang gửi…':'Yêu cầu hủy tác vụ'}</button>}
   {(error||job?.status==='unknown')&&<button onClick={props.onCancel} className="block mx-auto underline text-sm">Về cấu hình CLO</button>}
 </div>;
}
