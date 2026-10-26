import {useRef,useState} from 'react';
import {TopicCodeTree} from './TopicCodeTree';
import {buildTopicHierarchy,isTopicDescendant} from '../services/topicHierarchy';
import {confirmOutline,extractOutline,previewOutline,type OutlineDraft,type OutlinePlan} from '../services/courseOutlineService';

interface Props {onImported:(courseId:string)=>Promise<void>;onCancel:()=>void}
const field='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const secondary='rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50';
export function CourseOutlineImport({onImported,onCancel}:Props) {
 const [draft,setDraft]=useState<OutlineDraft|null>(null),[plan,setPlan]=useState<OutlinePlan|null>(null);
 const [fileName,setFileName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const [append,setAppend]=useState(false),[saved,setSaved]=useState<OutlinePlan|null>(null);
 const inFlight=useRef(false);
 const update=(edit:(next:OutlineDraft)=>void)=>{
  if(!draft||inFlight.current||saved)return;
  const next=structuredClone(draft);edit(next);setDraft(next);setPlan(null);setAppend(false);setError('');
 };
 const run=async(label:string,action:()=>Promise<void>)=>{
  if(inFlight.current)return;inFlight.current=true;setBusy(label);setError('');
  try{await action();}catch(e){setError(e instanceof Error?e.message:'Không xử lý được đề cương.');}
  finally{inFlight.current=false;setBusy('');}
 };
 const upload=(file:File|undefined)=>{
  if(!file)return;
  if(!/\.(pdf|docx)$/i.test(file.name)||file.size>20*1024*1024||!file.size){setError('Chọn PDF có text layer hoặc DOCX, tối đa 20 MB.');return;}
  void run('Đang đọc đề cương…',async()=>{setDraft(null);setPlan(null);setAppend(false);setSaved(null);setFileName(file.name);setDraft(await extractOutline(file));});
 };
 const hierarchyIssues=draft?.chapters.flatMap(chapter=>buildTopicHierarchy(chapter.topics,chapter.code).issues)??[];
 // Hierarchy warnings are recalculated from the edited rows, not retained from extraction.
 const sourceWarnings=draft?.warnings.filter(message=>!/^Mã chủ đề (bị trùng|không hợp lệ)|^Chủ đề (không khớp chương:|.*: thiếu chủ đề cha )/.test(message))??[];
 const removeTopic=(chapterIndex:number,topicIndex:number)=>{
  if(!draft)return;
  const chapter=draft.chapters[chapterIndex],topic=chapter.topics[topicIndex];
  const descendants=chapter.topics.filter(other=>isTopicDescendant(other.code,topic.code));
  if(descendants.length&&!window.confirm(`Chủ đề ${topic.code} có ${descendants.length} chủ đề con (${descendants.map(t=>t.code).join(', ')}). Chỉ loại chủ đề này; các chủ đề con sẽ giữ nguyên mã và phải xử lý cảnh báo thiếu cha trước khi lưu. Tiếp tục?`))return;
  update(d=>{d.chapters[chapterIndex].topics.splice(topicIndex,1);});
 };
 const confirm=()=>void run('Đang lưu toàn bộ cấu trúc…',async()=>{
  if(!draft||!plan||plan.conflicts.length||saved||hierarchyIssues.length)return;
  const result=await confirmOutline(draft,append);setSaved(result);
 });
 if(saved)return <section className="space-y-4 text-sm" aria-label="Kết quả nhập đề cương">
  <h3 className="font-semibold text-slate-900">Đã lưu cấu trúc học phần</h3>
  <p>Đã tạo {saved.created.chapters} chương, {saved.created.topics} chủ đề, {saved.created.clos} CLO. Bỏ qua {saved.skipped.chapters} chương, {saved.skipped.topics} chủ đề, {saved.skipped.clos} CLO đã có. Không ghi đè dữ liệu cũ.</p>
  {error&&<p role="alert" className="text-red-700">Dữ liệu đã lưu. {error}</p>}
  <button type="button" className={secondary} disabled={!!busy} onClick={()=>void run('Đang mở học phần…',()=>onImported(String(saved.courseId)))}>Mở học phần đã nhập</button>
 </section>;
 return <section className="space-y-5 text-sm" aria-label="Nhập cấu trúc từ đề cương">
  <div><h3 className="font-semibold text-slate-900">Tải đề cương học phần</h3>
   <p className="mt-1 text-slate-600">PDF có thể chọn chữ hoặc DOCX, tối đa 20 MB. Kiểm tra và chỉnh sửa nội dung bên dưới trước khi xác nhận lưu.</p></div>
  <fieldset disabled={!!busy} className="space-y-5 disabled:opacity-70">
   <label className="block space-y-2"><span className="font-medium">File đề cương</span>
    <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className={field} onChange={e=>{upload(e.target.files?.[0]);e.target.value='';}}/>
   </label>
   {draft&&<>
    <div className="border-b border-slate-200 pb-3"><h4 className="font-semibold">Bản xem trước · {fileName}</h4>
     <p className="mt-1 text-slate-600">{draft.chapters.length} chương · {draft.chapters.reduce((n,c)=>n+c.topics.length,0)} chủ đề · {draft.clos.length} CLO. Chưa ghi dữ liệu.</p></div>
    {!!sourceWarnings.length&&<ul className="list-disc pl-5 space-y-1 text-amber-900">{sourceWarnings.map((message,i)=><li key={i}>{message}</li>)}</ul>}
    {/* One full-width review column; metadata uses 2 equal columns, 16px gutter. */}
    <div className="grid gap-4 sm:grid-cols-2">
     <label className="space-y-2">Mã học phần<input className={field} value={draft.course.code} onChange={e=>update(d=>{d.course.code=e.target.value;})}/></label>
     <label className="space-y-2">Tên học phần<input className={field} value={draft.course.name} onChange={e=>update(d=>{d.course.name=e.target.value;})}/></label>
     <label className="space-y-2">Số tín chỉ<input type="number" min={1} max={30} className={field} value={draft.course.credits??''} onChange={e=>update(d=>{d.course.credits=e.target.value===''?null:Number(e.target.value);})}/></label>
     <label className="space-y-2">Đơn vị phụ trách<input className={field} value={draft.course.department} onChange={e=>update(d=>{d.course.department=e.target.value;})}/></label>
    </div>
    <section className="space-y-4"><h4 className="font-semibold">Chương và chủ đề</h4><p className="text-slate-600">Phân cấp theo từng đoạn mã: 2.1 → 2.1.1 → 2.1.1.1. Sửa mã chỉ cập nhật cây, không đổi mã các mục con.</p>
     {!draft.chapters.length&&<p className="text-slate-600">Không có chương được nhận diện. Bạn có thể bổ sung thủ công.</p>}
     {draft.chapters.map((chapter,i)=><div key={i} className="space-y-3 border-t border-slate-200 pt-4">
      <div className="grid gap-3 sm:grid-cols-[140px_1fr_auto]">
       <label>Mã chương<input className={field} value={chapter.code} onChange={e=>update(d=>{d.chapters[i].code=e.target.value;})}/></label>
       <label>Tên chương<textarea rows={2} className={field} value={chapter.name} onChange={e=>update(d=>{d.chapters[i].name=e.target.value;})}/></label>
       <button type="button" className="self-end py-2 text-red-700 underline" onClick={()=>update(d=>{d.chapters.splice(i,1);})}>Loại chương và {chapter.topics.length} chủ đề</button>
      </div>
      {<TopicCodeTree topics={chapter.topics} chapterCode={chapter.code} renderTopic={(topic,j)=><div key={j} className="grid gap-3 sm:grid-cols-[140px_1fr_auto]">
       <label>Mã chủ đề<input className={field} value={topic.code} onChange={e=>update(d=>{d.chapters[i].topics[j].code=e.target.value;})}/></label>
       <label>Tên chủ đề<textarea rows={2} className={field} value={topic.name} onChange={e=>update(d=>{d.chapters[i].topics[j].name=e.target.value;})}/></label>
       <button type="button" className="self-end py-2 text-red-700 underline" aria-label={`Loại chủ đề ${topic.code}`} onClick={()=>removeTopic(i,j)}>Loại bỏ</button>
      </div>}/> }
      <button type="button" className={secondary} onClick={()=>update(d=>{d.chapters[i].topics.push({code:'',name:''});})}>Thêm chủ đề</button>
     </div>)}
     <button type="button" className={secondary} onClick={()=>update(d=>{d.chapters.push({code:'',name:'',topics:[]});})}>Thêm chương</button>
    </section>
    <section className="space-y-4 border-t border-slate-200 pt-4"><h4 className="font-semibold">Chuẩn đầu ra CLO</h4>
     <p className="text-slate-600">Giữ nguyên mã có dấu *. Không tự liên kết CLO với chủ đề. Bloom chưa được phân loại từ đề cương; giá trị mặc định của hệ thống có thể chỉnh trong quản lý CLO.</p>
     {draft.clos.map((clo,i)=><div key={i} className="grid gap-3 sm:grid-cols-[140px_1fr_auto]">
      <label>Mã CLO<input className={field} value={clo.code} onChange={e=>update(d=>{d.clos[i].code=e.target.value;})}/></label>
      <label>Mô tả đầy đủ<textarea rows={4} className={field} value={clo.description} onChange={e=>update(d=>{d.clos[i].description=e.target.value;})}/></label>
      <button type="button" className="self-end py-2 text-red-700 underline" aria-label={`Loại CLO ${clo.code}`} onClick={()=>update(d=>{d.clos.splice(i,1);})}>Loại bỏ</button>
     </div>)}
     <button type="button" className={secondary} onClick={()=>update(d=>{d.clos.push({code:'',description:''});})}>Thêm CLO</button>
    </section>
    <button type="button" disabled={!!hierarchyIssues.length} className={secondary} onClick={()=>void run('Đang kiểm tra trùng…',async()=>{setPlan(null);setAppend(false);setPlan(await previewOutline(draft));})}>Kiểm tra dữ liệu trước khi lưu</button>
    {!!hierarchyIssues.length&&<p role="alert" className="text-amber-900">Cần xử lý cảnh báo mã chủ đề trước khi kiểm tra và lưu.</p>}
    {plan&&<div className="space-y-3 border-t border-slate-200 pt-4" aria-live="polite">
     {!!plan.conflicts.length?<ul role="alert" className="space-y-2 text-red-700">{plan.conflicts.map((message,i)=><li key={i}>{message}</li>)}</ul>:<>
      <p>Sẽ tạo {plan.created.chapters} chương, {plan.created.topics} chủ đề, {plan.created.clos} CLO; bỏ qua {plan.skipped.chapters} chương, {plan.skipped.topics} chủ đề, {plan.skipped.clos} CLO đã có.</p>
      {plan.existing?<label className="flex items-start gap-2"><input type="checkbox" checked={append} onChange={e=>setAppend(e.target.checked)}/><span>Tôi xác nhận bổ sung vào học phần đã có cùng mã. Chỉ thêm mục còn thiếu, không ghi đè hoặc xóa dữ liệu cũ.</span></label>:<p>Sẽ tạo học phần mới thuộc tài khoản giảng viên đang đăng nhập.</p>}
      <button type="button" disabled={plan.existing&&!append} className="rounded-lg bg-[#172b4d] px-4 py-2 text-white disabled:opacity-50" onClick={confirm}>Xác nhận lưu cấu trúc học phần</button>
     </>}
    </div>}
   </>}
  </fieldset>
  {!!busy&&<p role="status" className="text-slate-600">{busy}</p>}
  {!!error&&<p role="alert" className="text-red-700 whitespace-pre-wrap">{error}</p>}
  <button type="button" disabled={!!busy} className={secondary} onClick={onCancel}>Đóng nhập đề cương</button>
 </section>;
}
