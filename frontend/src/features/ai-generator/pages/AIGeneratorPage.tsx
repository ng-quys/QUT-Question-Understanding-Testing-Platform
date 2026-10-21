import {useEffect,useRef,useState} from 'react';
import type {Course,CourseChapter,CourseCLO,QuestionItem,SourceDocument,AIWorkflowStep} from '../../../types';
import {apiFetch} from '../../../services/api';
import {useAiQuota} from '../hooks/useAiQuota';
import {DocumentUploadStep} from '../components/DocumentUploadStep';
import {GeneratorStepper} from '../components/GeneratorStepper';
import {MatrixGenerationProgress} from '../components/MatrixGenerationProgress';
import {QuestionReviewStep} from '../components/QuestionReviewStep';

interface Props {
 courses:Course[];chapters:CourseChapter[];clos:CourseCLO[];questions?:QuestionItem[];
 onUpdateCourses?:(courses:Course[])=>void;onUpdateChapters?:(chapters:CourseChapter[])=>void;
 onSaveQuestions:(questions:QuestionItem[])=>void;onNavigateToQuestionBank:()=>void;
 onShowToast:(message:string)=>void;onBackToDashboard?:()=>void;
}
export function AIGeneratorPage({courses,chapters,clos,onSaveQuestions,onNavigateToQuestionBank,onShowToast,onBackToDashboard}:Props){
 const {quota,error:quotaError}=useAiQuota();
 const [step,setStep]=useState<AIWorkflowStep>(1);
 const [generating,setGenerating]=useState(false);
 const [documents,setDocuments]=useState<SourceDocument[]>([]);
 const [courseId,setCourseId]=useState('');
 const [courseClos,setCourseClos]=useState<CourseCLO[]>([]);
 const [selected,setSelected]=useState<string[]>([]);
 const [count,setCount]=useState(10);
 const [loadingClos,setLoadingClos]=useState(false);
 const [error,setError]=useState('');
 const [generated,setGenerated]=useState<QuestionItem[]>([]);
 const [charged,setCharged]=useState(0);
 const [requested,setRequested]=useState(0);
 const [jobKey,setJobKey]=useState('');
 const [resumeId,setResumeId]=useState<number>();
 const [storageKey,setStorageKey]=useState('');
 const [saving,setSaving]=useState(false);
 const resumed=useRef(false), starting=useRef(false), saved=useRef(new Set<string>());
 const [selectionCodes,setSelectionCodes]=useState<Array<{id:number;code:string}>>([]);
 useEffect(()=>{let active=true;void apiFetch<{id:number}>('/auth/me').then(actor=>{
   if(!active)return;const key=`examflow-ai-review-${actor.id}`;setStorageKey(key);
 }).catch(e=>{if(active)setError(String(e.message));});return()=>{active=false;};},[]);
 useEffect(()=>{if(storageKey&&quota&&!resumed.current){
   resumed.current=true;const id=quota.activeJob?.id||Number(sessionStorage.getItem(storageKey));
   if(id){setResumeId(id);setJobKey('resume-'+id);setGenerating(true);setStep(4);}
 }},[quota,storageKey]);
 useEffect(()=>{
   let active=true;setCourseClos([]);setSelected([]);setLoadingClos(!!courseId);
   if(courseId)void apiFetch<CourseCLO[]>(`/teacher/courses/${courseId}/clos`).then(rows=>{
     if(active)setCourseClos(rows.filter(c=>c.status==='active').map(c=>({...c,id:String(c.id),courseId:String(c.courseId)})));
   }).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoadingClos(false);});
   return()=>{active=false;};
 },[courseId]);
 const sourceText=documents.map(d=>d.extractedText||'').join('\n\n');
 const proof=documents[0]?.aiSourceProof;
 const canGenerate=!!storageKey&&!!courseId&&!loadingClos&&selected.length>0&&Number.isInteger(count)&&count>=1&&count<=45
   &&!!quota&&count<=quota.remaining&&!quota.activeJob&&sourceText.trim().length>=50&&!!proof;
 const start=()=>{
   if(!canGenerate||starting.current)return;starting.current=true;setError('');saved.current.clear();setGenerated([]);
   setSelectionCodes(courseClos.filter(c=>selected.includes(c.id)).map(c=>({id:Number(c.id),code:c.code})));
   setRequested(count);setResumeId(undefined);setJobKey(crypto.randomUUID());setGenerating(true);setStep(4);
 };
 const reviewClos=[...clos,...courseClos].filter((c,i,all)=>all.findIndex(x=>String(x.id)===String(c.id))===i);
 const save=async(status:'pending'|'approved')=>{
   if(saving)return;setSaving(true);setError('');
   try{
     for(const q of generated){if(saved.current.has(q.id))continue;
       await apiFetch('/teacher/questions',{method:'POST',body:JSON.stringify({courseId:Number(q.courseId),chapterId:Number(q.chapterId)||null,
         topicId:null,cloId:Number(q.cloId)||null,bloom:q.bloom,difficulty:'medium',content:q.content,explanation:q.explanation,
         status,defaultScore:q.default_score??0.5,answers:q.options.map((content,i)=>({content,correct:i===q.correctIndex}))})});
       saved.current.add(q.id);
     }
     onSaveQuestions(generated.map(q=>({...q,status,updatedAt:'Vừa xong'})));sessionStorage.removeItem(storageKey);onNavigateToQuestionBank();
   }catch(e){setError(e instanceof Error?e.message:'Không lưu được câu hỏi');}finally{setSaving(false);}
 };
 return <div className="space-y-4">
   <div className="flex items-center justify-between gap-3"><div><h1 className="text-xl font-bold text-slate-900">AI sinh câu hỏi học phần</h1><p className="text-sm text-slate-500">Tài liệu bài giảng → CLO → Số câu → Sinh và xem xét</p></div>
     <button onClick={onBackToDashboard} className="text-sm underline">Quay lại</button></div>
   <GeneratorStepper currentStep={step} isProcessing={generating} onStepClick={s=>{if(!generating)setStep(s);}}/>
   <p className="text-sm text-slate-600">{quota?`Còn ${quota.remaining} credits · Tối đa 45 câu/lượt`:quotaError||'Đang tải giới hạn sử dụng…'}</p>
   {quota?.activeJob&&!generating&&<button className="text-sm underline" onClick={()=>{setResumeId(quota.activeJob!.id);setJobKey('resume-'+quota.activeJob!.id);setGenerating(true);setStep(4);}}>Tiếp tục job #{quota.activeJob.id}</button>}
   {error&&<p role="alert" className="text-red-700">{error}</p>}
   {step===1&&<DocumentUploadStep documents={documents} onUpdateDocuments={setDocuments} onShowToast={onShowToast} onUploadSuccess={result=>{setDocuments(result.documents);setStep(2);}}/>}
   {step===2&&<div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
     <h2 className="font-semibold text-slate-900">Chọn chuẩn đầu ra CLO</h2>
     <label className="block text-sm">Học phần<select value={courseId} onChange={e=>{setError('');setCourseId(e.target.value);}} className="block w-full border border-slate-200 rounded-lg p-2 mt-2"><option value="">Chọn học phần</option>{courses.map(c=><option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></label>
     {loadingClos?<p>Đang tải CLO…</p>:courseId&&!courseClos.length?<p>Học phần chưa có CLO đang hoạt động. Hãy bổ sung CLO trước khi sinh câu hỏi.</p>:courseClos.map(c=><label key={c.id} className="flex gap-3 items-start text-sm border-b border-slate-100 pb-3"><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>setSelected(prev=>e.target.checked?[...prev,c.id]:prev.filter(id=>id!==c.id))}/><span><strong>{c.code}</strong> — {c.description}</span></label>)}
     <div className="flex gap-4"><button onClick={()=>setStep(1)} className="text-sm underline">Quay lại tài liệu</button><button disabled={!courseId||loadingClos||!selected.length} onClick={()=>setStep(3)} className="rounded-lg px-5 py-2 text-white bg-[#172b4d] disabled:opacity-40">Tiếp tục</button></div>
   </div>}
   {step===3&&<div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
     <h2 className="font-semibold text-slate-900">Số lượng câu hỏi</h2>
     <label className="block text-sm">Số câu (1–45)<input type="number" min={1} max={45} step={1} value={Number.isFinite(count)?count:''} onChange={e=>setCount(e.target.valueAsNumber)} className="block border border-slate-200 rounded-lg p-2 mt-2 w-32"/></label>
     <p className="text-sm">Credits dự kiến giữ chỗ: {Number.isFinite(count)?count:'—'}. Chỉ quyết toán theo số câu hợp lệ.</p>
     <p className="text-sm text-slate-500">AI ưu tiên CLO phù hợp tài liệu, tự đề xuất Bloom và có thể trả kết quả từng phần. Giảng viên cần kiểm tra và hiệu chỉnh.</p>
     {quota&&count>quota.remaining&&<p role="alert" className="text-sm text-red-700">Không đủ credits khả dụng cho số câu đã chọn.</p>}
     {(!Number.isInteger(count)||count<1||count>45)&&<p role="alert" className="text-sm text-red-700">Chọn số nguyên từ 1 đến 45 câu.</p>}
     <div className="flex gap-4"><button onClick={()=>setStep(2)} className="text-sm underline">Quay lại CLO</button><button disabled={!canGenerate} onClick={start} className="rounded-lg px-5 py-2 text-white bg-[#172b4d] disabled:opacity-40">Sinh câu hỏi</button></div>
   </div>}
   {step===4&&generating&&<MatrixGenerationProgress courseId={courseId} totalQuestions={count} cloIds={selected.map(Number)} courses={courses}
     idempotencyKey={jobKey} sourceProof={proof} resumeJobId={resumeId} sourceText={sourceText} storageKey={storageKey}
     onComplete={(qs,used,total,selectedClos)=>{setGenerated(qs);if(qs[0])setCourseId(qs[0].courseId);setCharged(used);setRequested(total);setSelectionCodes(selectedClos??selectionCodes);starting.current=false;setGenerating(false);setStep(4);}}
     onCancel={()=>{starting.current=false;setGenerating(false);setStep(3);}}/>}
   {step===4&&!generating&&<><p className="rounded-xl bg-slate-50 p-4 text-sm">Đã sinh {generated.length}/{requested} câu hợp lệ · Đã dùng {charged} credits. CLO chưa có câu: {selectionCodes.filter(c=>!generated.some(q=>Number(q.cloId)===c.id)).map(c=>c.code).join(', ')||'Không có'}. {generated.length<requested?'Không đủ câu hợp lệ theo căn cứ tài liệu/kiểm tra trùng hoặc tác vụ đã dừng. Phần giữ chỗ chưa dùng đã được hoàn. ':''}CLO/Bloom là đề xuất của AI, cần giảng viên thẩm định.</p>
     <QuestionReviewStep questions={generated} documents={documents} courses={courses} chapters={chapters} clos={reviewClos} saving={saving}
       onUpdateQuestion={(id,updates)=>setGenerated(prev=>prev.map(q=>q.id===id?{...q,...updates}:q))}
       onDeleteQuestion={id=>setGenerated(prev=>prev.filter(q=>q.id!==id))} onSaveAll={status=>void save(status)}
       onGenerateMore={()=>{starting.current=false;setStep(3);}} onNewDocuments={()=>{setDocuments([]);setStep(1);}}/>
   </>}
 </div>;
}
