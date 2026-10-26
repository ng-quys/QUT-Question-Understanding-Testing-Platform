import { useEffect, useState } from 'react';
import { Check, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import type { ExamReview, ExamContentInput, WorkspaceApi } from '../services/adminWorkspaceApi';
import { Modal, Notice } from './AdminUI';

export function AdminExamReviewDialog({id,api,onClose,onChanged}:{id:number;api:WorkspaceApi;onClose:()=>void;onEdit?:()=>void;onChanged:()=>void}){
 const [exam,setExam]=useState<ExamReview|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false);
 const [draft,setDraft]=useState<ExamContentInput|null>(null),[copy,setCopy]=useState(false);
 useEffect(()=>{let active=true;setLoading(true);api.examReview(id).then(v=>{if(active){setExam(v);setError('');}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Không tải được đề thi');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[id,api,revision]);
 function edit(){if(!exam)return;setCopy(!exam.canEdit);setDraft({expectedToken:exam.revisionToken||'',title:exam.title,questions:exam.questions.map(q=>({id:q.id,content:q.content,points:q.points,answers:q.answers.map(a=>({content:a.content,correct:a.correct}))}))});setError('');setNotice('');}
 function question(index:number,change:Partial<ExamContentInput['questions'][number]>){setDraft(d=>d&&({...d,questions:d.questions.map((q,n)=>n===index?{...q,...change}:q)}));}
 async function save(){if(!exam||!draft||busy)return;setBusy(true);setError('');try{
  if(draft.questions.some(q=>!q.content.trim()||!Number.isFinite(q.points)||q.points<=0||q.answers.filter(a=>a.correct).length!==1||q.answers.some(a=>!a.content.trim())))throw new Error('Mỗi câu cần nội dung, điểm lớn hơn 0 và đúng một đáp án đúng.');
  if(draft.questions.reduce((n,q)=>n+q.points,0)>100)throw new Error('Tổng điểm đề tối đa 100 điểm.');
  const result=await api.saveExamContent(exam.id,draft,copy);setExam(result);setDraft(null);setNotice(copy?`Đã tạo bản chỉnh sửa ${result.code}. Giảng viên phụ trách có thể thêm bản này vào ca chưa công bố.`:'Đã lưu nội dung đề thi.');onChanged();
 }catch(e){setError(e instanceof Error?e.message:'Không lưu được đề thi');}finally{setBusy(false);}}
 async function closeExam(){if(!exam)return;setBusy(true);setError('');try{await api.closeExam(exam.id);setExam(await api.examReview(exam.id));setConfirm(false);onChanged();}catch(e){setError(e instanceof Error?e.message:'Không đóng được đề');}finally{setBusy(false);}}
 const total=draft?.questions.reduce((n,q)=>n+(Number(q.points)||0),0);
 return <Modal title={draft?(copy?'Tạo bản chỉnh sửa':'Chỉnh sửa đề thi'):'Quản lý đề thi'} description={exam?`${exam.code} · ${exam.courseName}`:'Nội dung đề của ca thi'} onClose={onClose} busy={busy} wide>
  <div className="admin-modal-body admin-exam-review">
   {error&&<Notice>{error}{!draft&&<button className="admin-button secondary" onClick={()=>setRevision(v=>v+1)}>Thử lại</button>}</Notice>}{notice&&<Notice tone="success">{notice}</Notice>}
   {loading?<p role="status">Đang tải nội dung đề…</p>:exam&&<>
    {!draft?<><div className="exam-review-heading"><div><h3>{exam.title}</h3><p>{exam.questions.length} câu · {exam.totalPoints} điểm</p></div><span className="admin-tag">{exam.status==='cancelled'?'Đã đóng':exam.status==='draft'?'Đề nháp':'Đã sử dụng'}</span></div>
    {!exam.canEdit&&<Notice tone="info">Đề đã có lịch thi hoặc được sử dụng. Chọn “Tạo bản chỉnh sửa” để sửa nội dung trên một bản mới; bài làm và đề gốc được giữ nguyên.</Notice>}
    {exam.questions.map(q=><article key={q.id} className="admin-exam-question"><h4>Câu {q.position}<small>{q.points} điểm</small></h4><p>{q.content}</p><ul>{q.answers.map(a=><li key={a.label} className={a.correct?'correct':''}><strong>{a.label}.</strong> {a.content}{a.correct&&<span> · Đáp án đúng</span>}</li>)}</ul></article>)}
    {!exam.questions.length&&<p>Đề chưa có câu hỏi.</p>}
    </>:<form id="admin-exam-content" onSubmit={e=>{e.preventDefault();void save();}}>
     <fieldset disabled={busy} className="exam-editor-meta"><label>Tên đề<input required maxLength={200} value={draft.title} onChange={e=>setDraft(d=>d&&({...d,title:e.target.value}))}/></label><p className="admin-muted">Thời gian làm bài được quy định theo ca thi.</p></fieldset>
     <p className="admin-muted">{draft.questions.length} câu · Tổng điểm: {total?.toLocaleString('vi-VN')}. Tối đa 100 điểm. Chọn đáp án đúng bằng nút tròn cạnh mỗi lựa chọn.</p>
     {draft.questions.map((q,index)=><article key={index} className="admin-exam-question exam-question-editor"><header><h4>Câu {index+1}</h4><button type="button" className="admin-icon admin-danger" aria-label={`Xóa câu ${index+1} khỏi đề`} disabled={busy||draft.questions.length===1} onClick={()=>setDraft(d=>d&&({...d,questions:d.questions.filter((_,n)=>n!==index)}))}><Trash2 size={16}/></button></header>
      <label>Nội dung câu hỏi<textarea required disabled={busy} maxLength={20000} value={q.content} onChange={e=>question(index,{content:e.target.value})}/></label>
      <label className="exam-point-input">Điểm<input required disabled={busy} type="number" min="0.01" max="100" step="0.01" value={q.points} onChange={e=>question(index,{points:Number(e.target.value)})}/></label>
      <div className="exam-answer-editor">{q.answers.map((a,n)=><div key={n} className={a.correct?'correct':''}><label><input disabled={busy} type="radio" name={`correct-${index}`} aria-label={`Đáp án đúng câu ${index+1}: ${String.fromCharCode(65+n)}`} checked={a.correct} onChange={()=>question(index,{answers:q.answers.map((answer,m)=>({...answer,correct:m===n}))})}/><strong>{String.fromCharCode(65+n)}</strong></label><textarea aria-label={`Nội dung đáp án ${String.fromCharCode(65+n)} câu ${index+1}`} required disabled={busy} maxLength={10000} value={a.content} onChange={e=>question(index,{answers:q.answers.map((answer,m)=>m===n?{...answer,content:e.target.value}:answer)})}/>{a.correct&&<Check size={16}/>}</div>)}</div>
     </article>)}
     <button type="button" className="admin-button secondary" disabled={busy||draft.questions.length>=500} onClick={()=>setDraft(d=>d&&({...d,questions:[...d.questions,{id:null,content:'',points:1,answers:['','','',''].map((content,n)=>({content,correct:n===0}))}]}))}><Plus size={16}/>Thêm câu hỏi</button>
    </form>}
    {confirm&&!draft&&<div className="admin-notice" role="alert"><div><p>Đóng đề này? Đề không còn được chọn để công bố ca mới. Câu hỏi và lịch sử được giữ lại.</p><button className="admin-button secondary" disabled={busy} onClick={()=>setConfirm(false)}>Giữ đề</button> <button className="admin-button danger" disabled={busy} onClick={()=>void closeExam()}>Xác nhận đóng đề</button></div></div>}
   </>}
  </div>
  <footer key={draft?'editing':'viewing'}>{draft?<><button className="admin-button secondary" disabled={busy} onClick={()=>{setDraft(null);setError('');}}>Hủy chỉnh sửa</button><button className="admin-button primary" disabled={busy} type="submit" form="admin-exam-content"><Save size={16}/>{busy?'Đang lưu…':copy?'Lưu thành đề mới':'Lưu thay đổi'}</button></>:<><button className="admin-button secondary" disabled={busy} onClick={onClose}>Đóng cửa sổ</button>{exam&&!loading&&<button className="admin-button primary" type="button" disabled={busy} onClick={event=>{event.preventDefault();edit();}}><Pencil size={16}/>{exam.canEdit?'Chỉnh sửa đề':'Tạo bản chỉnh sửa'}</button>}{exam?.canClose&&!loading&&<button className="admin-button secondary" disabled={busy} onClick={()=>setConfirm(true)}>Đóng đề</button>}</>}</footer>
 </Modal>;
}
