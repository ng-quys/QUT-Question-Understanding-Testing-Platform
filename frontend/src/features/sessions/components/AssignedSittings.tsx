import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, CheckCircle2, Eye, FileCheck2, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { examDate } from '../../../utils/examTime';
import { assignedSittingApi, type AssignedGroup, type AssignedExamChoice, type AssignedExamPreview } from '../services/assignedSittingService';

const date=(text:string)=>examDate(text).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'});
const message=(error:unknown)=>error instanceof Error?error.message:'Không thể xử lý yêu cầu. Vui lòng thử lại.';
const button='inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50';
const primary='inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40';
const labels={scheduled:'Sắp diễn ra',ongoing:'Đã đến giờ thi',completed:'Đã kết thúc',cancelled:'Đã hủy'};

export function AssignedSittings({onCreateExam,onShowToast}:{onCreateExam:()=>void;onShowToast:(text:string)=>void}) {
  const [rows,setRows]=useState<AssignedGroup[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [search,setSearch]=useState(''),[filter,setFilter]=useState('all');
  const [dialog,setDialog]=useState<{group:AssignedGroup;viewOnly:boolean}|null>(null);
  const request=useRef(0);
  const load=useCallback(async(background=false)=>{
    const revision=++request.current;
    if(!background)setLoading(true);
    try{const result=await assignedSittingApi.list();if(revision===request.current){setRows(result);setError('');}}
    catch(cause){if(revision===request.current)setError(message(cause));}
    finally{if(revision===request.current)setLoading(false);}
  },[]);
  useEffect(()=>{void load();return()=>{request.current++;};},[load]);
  useEffect(()=>{
    const refresh=()=>{if(!dialog&&document.visibilityState==='visible')void load(true);};
    const interval=window.setInterval(refresh,15000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{window.clearInterval(interval);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[dialog,load]);
  const visible=rows.filter(row=>(filter==='all'||(filter==='missing'?!row.examId:filter==='published'?row.published:row.status===filter))&&
    `${row.name} ${row.courseCode} ${row.courseName} ${row.roomCode??''} ${row.examCode??''}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  return <div className="space-y-5 pb-10 text-slate-800">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5"><div><h2 className="flex items-center gap-2 text-2xl font-bold"><CalendarClock className="text-indigo-600"/>Ca thi được phân công</h2><p className="mt-2 text-sm text-slate-500">Chọn đề đã tạo cho đúng nhóm được giao. Admin sẽ kiểm tra và công bố ca thi.</p><p className="mt-1 text-xs text-slate-400">Thời gian làm bài theo ca thi · Tự cập nhật khi quay lại tab và mỗi 15 giây.</p></div><button className={button} disabled={loading} onClick={()=>void load()}><RefreshCw size={16} className={loading?'animate-spin':''}/>Làm mới</button></header>
    {error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button className="ml-3 underline" onClick={()=>void load()}>Thử lại</button></div>}
    {notice&&<div role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={18}/>{notice}</div>}
    <div className="flex flex-wrap gap-3"><label className="relative min-w-60 flex-1"><Search size={17} className="absolute left-3 top-3 text-slate-400"/><input aria-label="Tìm ca thi được phân công" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Tìm tên ca, môn, phòng hoặc mã đề…" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm"/></label><select aria-label="Lọc ca thi" value={filter} onChange={event=>setFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="all">Tất cả ca được giao</option><option value="missing">Chưa có đề</option><option value="published">Đã công bố</option><option value="scheduled">Sắp diễn ra</option><option value="ongoing">Đã đến giờ thi</option><option value="completed">Đã kết thúc</option><option value="cancelled">Đã hủy</option></select></div>
    {loading?<div role="status" className="flex justify-center gap-2 rounded-xl border bg-white py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin"/>Đang tải ca thi được phân công…</div>:error&&!rows.length?<p className="rounded-xl border border-red-200 bg-white p-6 text-sm text-slate-600">Chưa tải được dữ liệu ca thi. Nhấn Làm mới để thử lại.</p>:!visible.length?<div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><CalendarClock size={28} className="mx-auto text-slate-400"/><h3 className="mt-3 font-semibold">{rows.length?'Không có ca phù hợp bộ lọc':'Bạn chưa có ca/nhóm được phân công'}</h3><p className="mt-2 text-sm text-slate-500">{rows.length?'Thử thay đổi từ khóa hoặc trạng thái.':'Ca sẽ tự xuất hiện sau khi admin phân công cho tài khoản này. Bạn vẫn có thể tạo đề độc lập theo học phần.'}</p><button className={`${button} mt-4`} onClick={onCreateExam}>Đến Tạo đề tự động</button></div>:<div className="space-y-4">{visible.map(group=><article key={group.id} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-lg font-bold">{group.name} <span className="text-sm font-medium text-slate-500">· Nhóm {group.number}</span></h3><p className="mt-1 text-sm font-medium text-indigo-700">CT-{group.sittingId} · {group.courseCode} · {group.courseName}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${group.status==='cancelled'?'bg-red-50 text-red-700':group.status==='completed'?'bg-slate-100 text-slate-600':group.status==='ongoing'?'bg-amber-50 text-amber-800':'bg-blue-50 text-blue-700'}`}>{labels[group.status]}</span></div>
      <dl className="my-5 grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-xs text-slate-500">Phòng thi</dt><dd className="mt-1 font-medium">{group.roomCode?`${group.roomCode} · ${group.roomName??''}`:'Chưa phân phòng'}</dd></div><div><dt className="text-xs text-slate-500">Thời gian (Việt Nam)</dt><dd className="mt-1">{date(group.startTime)}<br/><span className="text-slate-500">đến {date(group.endTime)}</span></dd></div><div><dt className="text-xs text-slate-500">Danh sách dự thi</dt><dd className="mt-1 font-medium">{group.studentCount} sinh viên</dd></div></dl>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4"><span className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${group.examId?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-800'}`}>Đề: {group.examId?'Đã có đề':'Chưa có đề'}</span><span className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${group.published?'bg-indigo-50 text-indigo-800':'bg-slate-100 text-slate-600'}`}>{group.published?'Đã công bố':'Chưa công bố'}</span>{group.examId&&<span className="text-sm font-medium">{group.examCode} · {group.examTitle}</span>}<div className="ml-auto flex flex-wrap gap-2">{group.examId&&<button className={button} onClick={()=>setDialog({group,viewOnly:true})}><Eye size={15}/>Xem đề</button>}{group.canChangeExam&&<button className={group.examId?button:primary} onClick={()=>{setNotice('');setDialog({group,viewOnly:false});}}><FileCheck2 size={16}/>{group.examId?'Đổi đề':'Chọn đề'}</button>}</div></div>
      {!group.canChangeExam&&<p className="mt-3 text-xs text-slate-500">{group.lockReason}</p>}
    </article>)}</div>}
    {dialog&&<ExamSelector group={dialog.group} viewOnly={dialog.viewOnly} onClose={()=>setDialog(null)} onCreateExam={()=>{setDialog(null);onCreateExam();}} onSaved={updated=>{setRows(old=>old.map(row=>row.id===updated.id?updated:row));setDialog(null);const text=`Đã gắn ${updated.examCode} cho ${updated.name} · Nhóm ${updated.number}. Ca chưa công bố, chờ admin công bố.`;setNotice(text);onShowToast(text);void load(true);}}/>}
  </div>;
}

function ExamSelector({group:initial,viewOnly,onClose,onSaved,onCreateExam}:{group:AssignedGroup;viewOnly:boolean;onClose:()=>void;onSaved:(group:AssignedGroup)=>void;onCreateExam:()=>void}) {
  const [group,setGroup]=useState(initial),[rows,setRows]=useState<AssignedExamChoice[]>([]),[search,setSearch]=useState(''),[loading,setLoading]=useState(!viewOnly);
  const [error,setError]=useState(''),[preview,setPreview]=useState<AssignedExamPreview|null>(null),[previewLoading,setPreviewLoading]=useState(false);
  const [selected,setSelected]=useState<number|null>(null),[confirmed,setConfirmed]=useState(false),[saving,setSaving]=useState(false),[showAnswers,setShowAnswers]=useState(false),[retry,setRetry]=useState(0);
  const previewRequest=useRef(0),savingRef=useRef(false);
  useEffect(()=>{
    if(viewOnly)return;
    const abort=new AbortController();let active=true;
    const timeout=window.setTimeout(()=>{setLoading(true);assignedSittingApi.choices(initial.id,search,abort.signal).then(result=>{if(active){setRows(result.exams);setGroup(result.group);}}).catch(cause=>{if(active)setError(message(cause));}).finally(()=>{if(active)setLoading(false);});},200);
    return()=>{active=false;abort.abort();window.clearTimeout(timeout);};
  },[initial.id,search,viewOnly,retry]);
  async function openPreview(id:number,choose=false) {
    const request=++previewRequest.current;
    setPreviewLoading(true);setPreview(null);setError('');setConfirmed(false);if(choose)setSelected(id);
    try{const result=await assignedSittingApi.preview(initial.id,id);if(request===previewRequest.current)setPreview(result);}
    catch(cause){if(request===previewRequest.current)setError(message(cause));}
    finally{if(request===previewRequest.current)setPreviewLoading(false);}
  }
  useEffect(()=>{if(viewOnly&&initial.examId)void openPreview(initial.examId);return()=>{previewRequest.current++;};},[initial.id,initial.examId,viewOnly]);
  useEffect(()=>{
    const previous=document.body.style.overflow;document.body.style.overflow='hidden';
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!savingRef.current)onClose();};window.addEventListener('keydown',escape);
    return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',escape);};
  },[onClose]);
  async function save() {
    if(!preview||selected!==preview.id||!confirmed||savingRef.current||!group.canChangeExam)return;
    savingRef.current=true;setSaving(true);setError('');
    try{const result=await assignedSittingApi.select(group,preview);onSaved(result);}
    catch(cause){setError(message(cause));setConfirmed(false);setRetry(v=>v+1);}
    finally{savingRef.current=false;setSaving(false);}
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="assigned-exam-title" className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"><header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5"><div><h3 id="assigned-exam-title" className="text-lg font-bold">{viewOnly?'Nội dung đề đã gắn':'Chọn đề đã tạo cho ca thi'}</h3><p className="mt-1 text-sm text-slate-500">{group.name} · Nhóm {group.number} · {group.courseCode} · {group.roomCode??'Chưa phân phòng'}</p></div><button className={button} aria-label="Đóng" disabled={saving} onClick={onClose}><X size={18}/></button></header>
    <div className="space-y-5 overflow-y-auto p-5">
      {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!viewOnly&&!group.canChangeExam&&<div role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{group.lockReason}</div>}
      {!viewOnly&&<><p className="text-sm text-slate-500">Chỉ hiển thị đề do bạn tạo, đúng môn {group.courseCode} và còn sử dụng được. Chọn đề không tự công bố ca.</p><label className="flex gap-2"><Search size={18} className="mt-3 text-slate-400"/><input autoFocus value={search} disabled={saving} onChange={event=>setSearch(event.target.value)} placeholder="Tìm mã đề hoặc tên đề…" aria-label="Tìm đề phù hợp" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"/></label>
        {loading?<p role="status" className="flex gap-2 py-4 text-sm text-slate-500"><Loader2 size={17} className="animate-spin"/>Đang tải đề phù hợp…</p>:error&&!rows.length?<button className={button} onClick={()=>setRetry(v=>v+1)}>Thử tải lại danh sách đề</button>:!rows.length&&group.canChangeExam?<div className="rounded-xl border border-dashed border-slate-300 p-6 text-center"><h4 className="font-semibold">{search?'Không có đề khớp từ khóa':'Chưa có đề phù hợp cho môn này'}</h4><p className="mt-2 text-sm text-slate-500">Bạn có thể tạo và lưu nhiều đề tại mục Tạo đề tự động, sau đó quay lại chọn đề cho ca này.</p><button className={`${button} mt-4`} disabled={saving} onClick={onCreateExam}>Đến Tạo đề tự động</button></div>:<div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[500px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Đề thi</th><th className="p-3">Số câu</th><th className="p-3">Tổng điểm</th><th className="p-3">Thao tác</th></tr></thead><tbody>{rows.map(exam=><tr key={exam.id} className={`border-t border-slate-100 ${selected===exam.id?'bg-indigo-50':''}`}><td className="p-3"><b>{exam.code}</b><p className="mt-1">{exam.title}</p></td><td className="p-3">{exam.questions}</td><td className="p-3">{exam.totalPoints}</td><td className="p-3"><div className="flex gap-2"><button className={button} disabled={saving||previewLoading} onClick={()=>void openPreview(exam.id)}><Eye size={15}/>Xem trước</button><button className={selected===exam.id?primary:button} disabled={saving||previewLoading||!group.canChangeExam} onClick={()=>void openPreview(exam.id,true)}>{selected===exam.id?'Đã chọn':'Chọn'}</button></div></td></tr>)}</tbody></table></div>}</>}
      {previewLoading&&<p role="status" className="flex gap-2 text-sm text-slate-500"><Loader2 size={17} className="animate-spin"/>Đang tải nội dung đề…</p>}
      {preview&&<section className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-bold">{preview.code} · {preview.title}</h4><p className="mt-1 text-xs text-slate-500">{preview.questions.length} câu · {preview.totalPoints} điểm</p></div><label className="flex gap-2 text-xs text-slate-600"><input type="checkbox" checked={showAnswers} onChange={event=>setShowAnswers(event.target.checked)}/>Hiện đáp án đúng</label></div><ol className="mt-5 space-y-5">{preview.questions.map((question,index)=><li key={`${question.position}:${question.id}`}><p className="whitespace-pre-wrap text-sm font-medium leading-6">Câu {index+1}. {question.content} <span className="text-xs font-normal text-slate-500">({question.points} điểm)</span></p><ul className="mt-2 grid gap-2 sm:grid-cols-2">{question.answers.map(answer=><li key={answer.label} className={`whitespace-pre-wrap rounded-lg p-2 text-sm ${showAnswers&&answer.correct?'bg-emerald-50 text-emerald-800':'bg-slate-50'}`}><b>{answer.label}.</b> {answer.content}{showAnswers&&answer.correct?' ✓':''}</li>)}</ul></li>)}</ol></section>}
    </div>
    <footer className="space-y-3 border-t border-slate-200 bg-slate-50 p-5">{!viewOnly&&preview&&selected===preview.id&&group.canChangeExam&&<label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" disabled={saving} checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>Xác nhận {group.examId?'đổi sang':'gắn'} đề <b>{preview.code}</b> cho <b>{group.name} · Nhóm {group.number}</b>. Admin sẽ công bố ca sau.</span></label>}<div className="flex justify-end gap-3"><button className={button} disabled={saving} onClick={onClose}>Đóng</button>{!viewOnly&&<button className={primary} disabled={saving||loading||previewLoading||!confirmed||!preview||selected!==preview.id||!group.canChangeExam} onClick={()=>void save()}>{saving?<Loader2 size={17} className="animate-spin"/>:<FileCheck2 size={17}/>} {saving?'Đang lưu…':'Xác nhận gắn đề'}</button>}</div></footer>
  </section></div>;
}
