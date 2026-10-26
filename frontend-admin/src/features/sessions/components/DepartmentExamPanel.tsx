import { AutoRefreshIndicator } from './AutoRefreshIndicator';
import { DateTime24Field } from '../../../shared/components/DateTime24Field';
import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, Check, Pencil, Save, Plus, ChevronRight, DoorOpen, FileText, Users, X } from 'lucide-react';
import { apiFetch } from '@shared/services/api';
import { examDate } from '@shared/utils/examTime';
import { SittingCandidateStatus } from './SittingCandidateStatus';
import { SittingExamReadiness, SittingPublication, SittingStatus } from './SittingPublication';
import { ADMIN_REFRESH_INTERVAL_MS, startVisiblePolling } from '../services/visiblePolling';

type Item={id:number;code?:string;name?:string;status?:string;capacity?:number;courseId?:number;authorId?:number};
type Student={id:number;username:string;name:string;className?:string;department?:string;releasedAt?:string};
type Options={courses:Item[];periods:Item[];departments:{name:string;studentCount:number}[]};
type Counts={total:number;assigned:number;remaining:number;students:Student[]};
type Group={id:number;number:number;roomId?:number;roomCode?:string;roomName?:string;teacherId?:number;teacherName?:string;examId?:number;examTitle?:string;examStatus?:string;availableExamCount?:number;sessionId?:number;status:string;aiEnabled?:boolean;publishedAt?:string;studentCount:number;students:Student[];missing:string[];ready:boolean};
type Sitting={canEditSchedule?:boolean;scheduleLockReason?:string;id:number;code?:string;name:string;courseId:number;department:string;courseCode?:string;courseName?:string;periodName?:string;startTime:string;endTime:string;groups:Group[];groupCount?:number;studentCount?:number;publishedGroups?:number;groupsWithExam?:number;status?:string;kind?:string};
type Input={requestId:string;periodId:number;courseId:number;department:string;name:string;startTime:string;endTime:string;studentsPerGroup:number};
type Preview={previewToken:string;total:number;assigned:number;remaining:number;groups:{number:number;startTime:string;endTime:string;students:Student[]}[]};
type Props={activeView?:boolean;refreshKey?:number;view?:'create'|'list'|'combined';initialSittingId?:number|null;onManageSitting?:(id:number)=>void;hideHeading?:boolean;rooms:Item[];classes?:Item[];teachers?:Item[];exams:Item[];request?:typeof apiFetch;onCreated:()=>void;onOpenExam?:(id:number)=>void;onOpenSession?:(id:number)=>void};
const base='/admin/organization/department-exams';
const date=(value:string)=>examDate(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});

const stages:Record<string,string>={assignment:'Chờ phân công',exam:'Chờ đề thi',ready:'Sẵn sàng',partial:'Công bố một phần',published:'Đã công bố',ongoing:'Đang diễn ra',completed:'Đã kết thúc',cancelled:'Đã hủy'};
export function DepartmentExamPanel({activeView=true,refreshKey=0,rooms,teachers=[],request=apiFetch,onCreated,onOpenSession,onOpenExam,onManageSitting,initialSittingId,hideHeading=false,view='combined'}:Props){
 const [options,setOptions]=useState<Options>({courses:[],periods:[],departments:[]}),[revision,setRevision]=useState(0);
 const [creating,setCreating]=useState(view==='create'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [loading,setLoading]=useState(true),[rows,setRows]=useState<Sitting[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(0),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[status,setStatus]=useState('');
 const loadedListKey=useRef('');
 const [listSyncError,setListSyncError]=useState('');
 const [form,setForm]=useState({periodId:'',courseId:'',department:'',name:'',startTime:'',endTime:'',studentsPerGroup:'30'});
 const [counts,setCounts]=useState<Counts|null>(null),[preview,setPreview]=useState<Preview|null>(null),[proposed,setProposed]=useState<Input|null>(null);
 const [countsLoading,setCountsLoading]=useState(false),[countsError,setCountsError]=useState(''),[countsRevision,setCountsRevision]=useState(0);
 const candidateStatusId=useId();
 const [periodName,setPeriodName]=useState('');
 const [detail,setDetail]=useState<Sitting|null>(null),[assignment,setAssignment]=useState<{id:number;roomId:string;teacherId:string}|null>(null),[cancelId,setCancelId]=useState<number|null>(null),[confirmPublish,setConfirmPublish]=useState(false);
 const [scheduleEdit,setScheduleEdit]=useState<{name:string;startTime:string;endTime:string;expectedStartTime:string;expectedEndTime:string}|null>(null);
 const [step,setStep]=useState(1),[previewGroup,setPreviewGroup]=useState(0),[rosterPage,setRosterPage]=useState(0);
 const wizard=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(step>1){wizard.current?.scrollIntoView({block:'start',behavior:'smooth'});wizard.current?.focus({preventScroll:true});}},[step]);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(!activeView)return;const c=new AbortController();request<Options>(`${base}/options`,{signal:c.signal}).then(setOptions).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[revision,request,activeView,refreshKey]);
 useEffect(()=>{
  if(!activeView||view==='create')return;
  const listKey=JSON.stringify([page,search,status]);
  setLoading(loadedListKey.current!==listKey);setListSyncError('');
  return startVisiblePolling(async signal=>{
   try{
    const value=await request<{total:number;items:Sitting[]}>(`${base}?${new URLSearchParams({page:String(page),search,status})}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
    if(signal.aborted)return;
    loadedListKey.current=listKey;setRows(value.items);setTotal(value.total);setListSyncError('');
   }catch{
    if(!signal.aborted)setListSyncError('Chưa cập nhật được danh sách. Hệ thống sẽ tự thử lại; dữ liệu đang hiển thị có thể chưa mới nhất.');
   }finally{if(!signal.aborted)setLoading(false);}
  },{interval:ADMIN_REFRESH_INTERVAL_MS});
 },[page,search,status,revision,request,view,activeView,refreshKey]);
 useEffect(()=>{
  if(!activeView)return;
  const c=new AbortController();setCounts(null);setCountsError('');
  if(!form.courseId||!form.periodId||!form.department){setCountsLoading(false);return()=>c.abort();}
  setCountsLoading(true);
  const params=new URLSearchParams({courseId:form.courseId,periodId:form.periodId,department:form.department});
  request<Counts>(`${base}/candidates?${params}`,{signal:AbortSignal.any([c.signal,AbortSignal.timeout(20000)])})
   .then(value=>{if(!c.signal.aborted)setCounts(value);})
   .catch(cause=>{if(!c.signal.aborted)setCountsError(cause instanceof Error?cause.message:'Không kết nối được máy chủ.');})
   .finally(()=>{if(!c.signal.aborted)setCountsLoading(false);});
  return()=>c.abort();
 },[form.courseId,form.periodId,form.department,revision,countsRevision,request,activeView]);
 useEffect(()=>{if(!activeView||!initialSittingId)return;const c=new AbortController();request<Sitting>(`${base}/${initialSittingId}`,{signal:c.signal}).then(setDetail).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[initialSittingId,request,activeView]);
 useEffect(()=>{const element=dialog.current;if(detail){if(!element?.open)element?.showModal();}else element?.close();},[detail]);
 const detailId=detail?.id;
 useEffect(()=>{
  if(!activeView||!detailId||busy||assignment||confirmPublish||cancelId||scheduleEdit)return;
  return startVisiblePolling(async signal=>{
   const value=await request<Sitting>(`${base}/${detailId}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
   if(!signal.aborted)setDetail(value);
  },{immediate:false,interval:ADMIN_REFRESH_INTERVAL_MS});
 },[detailId,busy,assignment,confirmPublish,cancelId,scheduleEdit,request,activeView]);
 const update=(key:keyof typeof form,value:string)=>{setPreview(null);setProposed(null);setStep(1);setNotice('');if(['courseId','periodId','department'].includes(key))setCounts(null);setForm(f=>({...f,[key]:value}));};
 async function run(action:()=>Promise<unknown>,message:string){if(busy)return false;setBusy(true);setError('');setNotice('');try{await action();setNotice(message);setRevision(v=>v+1);return true;}catch(e){setError(e instanceof Error?e.message:'Thao tác chưa thành công');return false;}finally{setBusy(false);}}
 async function open(row:Sitting){if(row.kind==='legacy'){onOpenSession?.(row.id);return;}await run(async()=>{setDetail(await request<Sitting>(`${base}/${row.id}`));setAssignment(null);setCancelId(null);setConfirmPublish(false);},'');}
 async function prepare(){if(busy||countsLoading||countsError||!counts?.remaining)return;setBusy(true);setError('');setPreview(null);setProposed(null);const input:Input={requestId:crypto.randomUUID(),periodId:Number(form.periodId),courseId:Number(form.courseId),department:form.department,name:form.name.trim(),startTime:form.startTime,endTime:form.endTime,studentsPerGroup:Number(form.studentsPerGroup)};try{setPreview(await request<Preview>(`${base}/preview`,{method:'POST',body:JSON.stringify(input),signal:AbortSignal.timeout(60000)}));setProposed(input);setPreviewGroup(0);setRosterPage(0);setStep(2);}catch(e){setError(e instanceof Error?e.message:'Không xem trước được danh sách');}finally{setBusy(false);}}
 const close=()=>{if(!busy){setDetail(null);setAssignment(null);setCancelId(null);setConfirmPublish(false);setScheduleEdit(null);}};
 const active=detail?.groups.filter(g=>g.status!=='cancelled')||[];
 const canPublish=active.length>0&&active.every(g=>g.publishedAt||g.ready)&&active.some(g=>!g.publishedAt);
 const published=active.filter(g=>g.publishedAt).length;
 return <div className="allocation-workspace sitting-workspace" aria-busy={busy}>
  {!hideHeading&&<h2>{view==='list'?'Danh sách ca thi':'Tạo ca thi'}</h2>}
  {error&&<p className="org-error" role="alert">{error}</p>}{notice&&<p className="org-success" role="status">{notice}</p>}
  {view==='combined'&&<div className="org-toolbar"><p>Chọn môn và khoa, chia danh sách dự thi rồi phân phòng và giảng viên. Giảng viên sẽ thêm đề vào ca.</p><button className="org-primary" onClick={()=>setCreating(v=>!v)}>{creating?'Ẩn biểu mẫu':'Tạo ca thi'}</button></div>}
  {creating&&view!=='list'&&<>
   <div ref={wizard} tabIndex={-1} className="sitting-wizard-anchor"/>
   <ol className="sitting-steps" aria-label="Các bước tạo ca">{['Thông tin ca thi','Kiểm tra danh sách','Xác nhận & lưu'].map((title,index)=><li key={title} className={step===index+1?'active':step>index+1?'complete':''}><button type="button" disabled={busy||(index>0&&!preview)} aria-current={step===index+1?'step':undefined} onClick={()=>setStep(index+1)}><span>{step>index+1?<Check size={16}/>:index+1}</span><div><small>Bước {index+1}</small>{title}</div></button></li>)}</ol>
   {step===1&&<>
   <section className="allocation-card sitting-create"><header><div><h3>Thông tin ca thi</h3><p>Các nhóm dự thi cùng môn và cùng thời gian. Mã ca được cấp tự động.</p></div><CalendarDays size={24}/></header>
    <form onSubmit={e=>{e.preventDefault();void prepare();}}><fieldset disabled={busy} className="department-exam-fields">
     <label>Đợt thi<select required value={form.periodId} onChange={e=>update('periodId',e.target.value)}><option value="">Chọn đợt thi</option>{options.periods.filter(p=>p.status==='active').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
     <label>Môn thi<select required value={form.courseId} onChange={e=>update('courseId',e.target.value)}><option value="">Chọn môn thi</option>{options.courses.map(c=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></label>
     <label>Khoa<select required value={form.department} onChange={e=>update('department',e.target.value)}><option value="">Chọn khoa có sinh viên dự thi</option>{options.departments.map(d=><option key={d.name} value={d.name}>{d.name} · {d.studentCount} sinh viên</option>)}</select></label>
     <label>Tên ca thi<input required maxLength={160} value={form.name} placeholder="Ví dụ: Thi Cấu trúc dữ liệu cuối kỳ" onChange={e=>update('name',e.target.value)}/></label>
     <label>Bắt đầu<DateTime24Field label="Bắt đầu" required value={form.startTime} onChange={value=>update('startTime',value)}/></label>
     <label>Kết thúc<DateTime24Field label="Kết thúc" required min={form.startTime} value={form.endTime} onChange={value=>update('endTime',value)}/></label>
     <label>Sinh viên tối đa mỗi phòng<input required type="number" min={1} max={1000} value={form.studentsPerGroup} onChange={e=>update('studentsPerGroup',e.target.value)}/><small>Ví dụ 100 sinh viên, 30 người/phòng → 30 · 30 · 30 · 10.</small></label>
     <div className="sitting-hint"><Users size={20}/><p>Danh sách lấy từ khoa đã chọn, sắp theo tên tiếng Việt và loại sinh viên đã xếp môn này trong cùng đợt.</p></div>
    </fieldset><SittingCandidateStatus id={candidateStatusId} selected={!!(form.courseId&&form.periodId&&form.department)} loading={countsLoading} error={countsError} counts={counts} busy={busy} onRetry={()=>setCountsRevision(value=>value+1)}/><footer className="sitting-form-footer"><span>Thời gian theo giờ Việt Nam (UTC+7).</span><button className="org-primary" aria-describedby={candidateStatusId} disabled={busy||countsLoading||!!countsError||!counts?.remaining}>{busy?'Đang xử lý…':countsLoading?'Đang kiểm tra danh sách…':'Xem trước danh sách'}<ChevronRight size={16}/></button></footer></form>
   </section>
   <details className="sitting-period"><summary><span className="sitting-period-icon"><Plus size={19}/></span><span><strong>Thêm đợt thi</strong><small>Tạo đợt mới nếu chưa có lựa chọn phù hợp.</small></span><ChevronRight size={17} className="sitting-period-chevron"/></summary><form onSubmit={e=>{e.preventDefault();void run(async()=>{const result=await request<{id:number}>('/admin/organization/allocation/periods',{method:'POST',body:JSON.stringify({name:periodName})});if(result.id)update('periodId',String(result.id));setPeriodName('');},'Đã thêm đợt thi.');}}><div className="allocation-fields"><label>Mã đợt<input readOnly value="Tự động cấp khi lưu"/><small>Mã ngắn như DT01, DT02 do hệ thống cấp.</small></label><label>Tên đợt<input required disabled={busy} maxLength={150} placeholder="Cuối học kỳ 1" value={periodName} onChange={e=>setPeriodName(e.target.value)}/></label></div><button className="org-primary" disabled={busy}><Plus size={16}/>Thêm đợt thi</button></form></details>
   </>}
   {step===2&&preview&&proposed&&<section className="allocation-card allocation-preview sitting-review"><header><div><h3>Kiểm tra danh sách dự thi</h3><p>Danh sách được chia theo tên tiếng Việt. Chọn nhóm để kiểm tra trước khi tiếp tục.</p></div><Users size={24}/></header>
    <div className="sitting-review-metrics"><span><strong>{preview.remaining}</strong>Sinh viên dự thi</span><span><strong>{preview.groups.length}</strong>Nhóm dự thi</span><span><strong>{proposed.studentsPerGroup}</strong>Tối đa mỗi nhóm</span></div>
    <div className="sitting-group-tabs" aria-label="Chọn nhóm xem trước">{preview.groups.map((g,index)=><button type="button" aria-pressed={previewGroup===index} className={previewGroup===index?'selected':''} key={g.number} onClick={()=>{setPreviewGroup(index);setRosterPage(0);}}><Users size={16}/><span>Nhóm {g.number}</span><strong>{g.students.length}</strong></button>)}</div>
    {preview.groups[previewGroup]&&<><div className="sitting-roster-heading"><h4>Danh sách nhóm {preview.groups[previewGroup].number}</h4><span>{preview.groups[previewGroup].students.length} sinh viên · Sắp xếp theo tên</span></div><div className="org-table sitting-preview-table"><table><thead><tr><th>STT</th><th>Mã sinh viên</th><th>Họ và tên</th><th>Lớp hành chính</th></tr></thead><tbody>{preview.groups[previewGroup].students.slice(rosterPage*10,rosterPage*10+10).map((student,index)=><tr key={student.id}><td>{rosterPage*10+index+1}</td><td><code>{student.username}</code></td><td><strong>{student.name}</strong></td><td>{student.className||'Chưa có lớp'}</td></tr>)}</tbody></table></div><div className="sitting-roster-pagination"><span>Trang {rosterPage+1}/{Math.max(1,Math.ceil(preview.groups[previewGroup].students.length/10))}</span><div><button disabled={rosterPage===0} onClick={()=>setRosterPage(p=>p-1)}>Trước</button><button disabled={(rosterPage+1)*10>=preview.groups[previewGroup].students.length} onClick={()=>setRosterPage(p=>p+1)}>Tiếp</button></div></div></>}
    <footer className="sitting-form-footer"><button disabled={busy} onClick={()=>setStep(1)}>Quay lại thông tin</button><button className="org-primary" disabled={busy} onClick={()=>setStep(3)}>Tiếp tục xác nhận<ChevronRight size={16}/></button></footer>
   </section>}
   {step===3&&preview&&proposed&&<section className="allocation-card sitting-confirm-create"><header><span className="sitting-confirm-icon"><Check size={24}/></span><div><h3>Xác nhận tạo ca thi</h3><p>Kiểm tra thông tin lần cuối. Ca được lưu ở trạng thái chờ phân công.</p></div></header><h4>{proposed.name}</h4><dl className="sitting-final-summary"><div><dt>Môn thi</dt><dd>{options.courses.find(c=>c.id===proposed.courseId)?.name}</dd></div><div><dt>Đợt thi</dt><dd>{options.periods.find(p=>p.id===proposed.periodId)?.name}</dd></div><div><dt>Khoa</dt><dd>{proposed.department}</dd></div><div><dt>Danh sách dự thi</dt><dd>{preview.remaining} sinh viên · {preview.groups.length} nhóm</dd></div><div><dt>Bắt đầu</dt><dd>{date(proposed.startTime)}</dd></div><div><dt>Kết thúc</dt><dd>{date(proposed.endTime)}</dd></div></dl><div className="sitting-next-note"><DoorOpen size={20}/><p>Sau khi lưu, bạn phân phòng và giảng viên. Giảng viên thêm đề vào ca; sinh viên được vào thi sau khi công bố và đến giờ.</p></div><footer className="sitting-form-footer"><button disabled={busy} onClick={()=>setStep(2)}>Quay lại danh sách</button><button className="org-primary" disabled={busy} onClick={()=>void run(async()=>{const saved=await request<Sitting>(base,{method:'POST',body:JSON.stringify({...proposed,previewToken:preview.previewToken}),signal:AbortSignal.timeout(60000)});setPreview(null);setProposed(null);setStep(1);onCreated();if(onManageSitting)onManageSitting(saved.id);else{setDetail(saved);if(view==='combined')setCreating(false);}},'Đã lưu ca thi. Bổ sung phân công và công bố khi sẵn sàng.')}>{busy?'Đang lưu…':'Xác nhận & lưu ca thi'}<Check size={16}/></button></footer></section>}

  </>}
  {view!=='create'&&<>
   <form className="sitting-filters" onSubmit={e=>{e.preventDefault();setPage(0);setSearch(query.trim());}}><label>Tìm ca thi<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Mã ca, tên ca, môn hoặc khoa"/></label><label>Trạng thái<select value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="">Tất cả trạng thái</option>{Object.entries(stages).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button disabled={busy}>Tìm kiếm</button></form>
   <div className="sitting-list-caption"><strong>{total} ca thi</strong><AutoRefreshIndicator /></div>
   {listSyncError&&<p className="org-error" role="status">{listSyncError} <button type="button" disabled={busy} onClick={()=>setRevision(v=>v+1)}>Thử lại</button></p>}
   {loading?<p role="status">Đang tải danh sách ca thi…</p>:<div className="org-table"><table><thead><tr><th>Ca thi / Môn</th><th>Thời gian</th><th>Danh sách dự thi</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{rows.map(s=>{
    return <tr key={`${s.kind||'sitting'}-${s.id}`}>
     <td><strong>{s.name}</strong><small><code>{s.code||`CT-${s.id}`}</code> · {s.courseCode} · {s.courseName}</small><small>{s.department} · {s.periodName}</small></td>
     <td>{date(s.startTime)}<small>Đến {date(s.endTime)}</small></td>
     <td>{s.groupCount} nhóm · {s.studentCount} sinh viên<SittingExamReadiness ready={s.groupsWithExam??0} total={s.groupCount??0}/></td>
     <td><SittingStatus stage={s.status||'assignment'} published={s.publishedGroups??0} total={s.groupCount??0}/></td>
     <td><button onClick={()=>void open(s)} disabled={busy}>Chi tiết ca thi</button></td>
    </tr>;
   })}</tbody></table>{!rows.length&&<div className="sitting-empty"><CalendarDays size={28}/><h3>Chưa có ca thi phù hợp</h3><p>Thay đổi bộ lọc hoặc chọn Tạo ca thi ở sidebar.</p></div>}</div>}
   <div className="org-toolbar"><span>Trang {page+1}/{Math.max(1,Math.ceil(total/20))}</span><div><button disabled={busy||page===0} onClick={()=>setPage(p=>p-1)}>Trước</button><button disabled={busy||(page+1)*20>=total} onClick={()=>setPage(p=>p+1)}>Tiếp</button></div></div>
  </>}
  <dialog ref={dialog} className="org-dialog sitting-detail" aria-label="Chi tiết ca thi và phân công" onCancel={e=>{e.preventDefault();close();}}>{detail&&<>
   <header><div><small className="org-reference">CHI TIẾT CA THI <span>·</span> {detail.code||`CT-${detail.id}`}</small><h2>{detail.name}</h2><div className="sitting-detail-meta"><span><Users size={14}/>{detail.department}</span><span><CalendarDays size={14}/>{date(detail.startTime)} – {date(detail.endTime)}</span></div></div><div className="sitting-header-actions">{detail.canEditSchedule&&<button disabled={busy||!!scheduleEdit} onClick={()=>{setError('');setConfirmPublish(false);setScheduleEdit({name:detail.name,startTime:detail.startTime.slice(0,16),endTime:detail.endTime.slice(0,16),expectedStartTime:detail.startTime,expectedEndTime:detail.endTime});}}><Pencil size={15}/>Chỉnh sửa ca thi</button>}<button className="sitting-close" aria-label="Đóng chi tiết ca" disabled={busy} onClick={close}><X size={18}/></button></div></header>
   <div className="sitting-detail-body">
   {error&&<p className="org-error" role="alert">{error}</p>}{notice&&<p className="org-success" role="status">{notice}</p>}
   {scheduleEdit&&<form className="sitting-schedule-editor" onSubmit={e=>{e.preventDefault();const fields=new FormData(e.currentTarget);const changes={...scheduleEdit,name:String(fields.get('name')),startTime:String(fields.get('startTime')),endTime:String(fields.get('endTime'))};void run(async()=>{setDetail(await request<Sitting>(`${base}/${detail.id}/schedule`,{method:'PUT',body:JSON.stringify(changes)}));setScheduleEdit(null);onCreated();},'Đã cập nhật lịch ca thi và đồng bộ các nhóm dự thi.');}}><div><CalendarDays size={20}/><div><h3>Chỉnh sửa thông tin và giờ thi</h3><p>Áp dụng cho tất cả nhóm trong ca. Giữ nguyên đề, phòng, giảng viên và danh sách sinh viên.</p></div></div><fieldset disabled={busy}><label className="full">Tên ca thi<input name="name" required maxLength={160} value={scheduleEdit.name} onChange={e=>setScheduleEdit(v=>v&&({...v,name:e.target.value}))}/></label><label>Bắt đầu<DateTime24Field label="Bắt đầu" name="startTime" required value={scheduleEdit.startTime} onChange={value=>setScheduleEdit(v=>v&&({...v,startTime:value}))}/></label><label>Kết thúc<DateTime24Field label="Kết thúc" name="endTime" required min={scheduleEdit.startTime} value={scheduleEdit.endTime} onChange={value=>setScheduleEdit(v=>v&&({...v,endTime:value}))}/></label></fieldset><p className="sitting-schedule-note">Giờ Việt Nam · Hệ thống kiểm tra trùng lịch trước khi lưu. Ca đã công bố chỉ được sửa khi chưa bắt đầu và chưa có bài làm.</p><footer><button type="button" disabled={busy} onClick={()=>setScheduleEdit(null)}>Hủy chỉnh sửa</button><button className="org-primary" disabled={busy}><Save size={15}/>{busy?'Đang lưu…':'Lưu thay đổi'}</button></footer></form>}
   {!scheduleEdit&&!detail.canEditSchedule&&detail.scheduleLockReason&&<p className="sitting-schedule-locked"><CalendarDays size={15}/>{detail.scheduleLockReason}</p>}
   <div className="sitting-publish-bar"><div><SittingPublication published={published} total={active.length}/><p>{active.length>0&&published===active.length?'Lịch thi và danh sách dự thi đã được công bố. Sinh viên có thể vào khi đến giờ.':'Công bố để xác nhận lịch và danh sách dự thi. Sinh viên chỉ được vào khi đến giờ.'}</p>{!canPublish&&published<active.length&&<small>Cần đủ phòng, giảng viên và đề thi cho tất cả nhóm trước khi công bố.</small>}</div><div><button disabled={busy} onClick={()=>void open(detail)}>Làm mới</button><button className="org-primary" disabled={busy||!canPublish||!!scheduleEdit} onClick={()=>setConfirmPublish(true)}>{active.length>0&&published===active.length?'Đã công bố':'Công bố ca thi'}</button></div></div>
   {confirmPublish&&<section className="sitting-confirm" role="alert"><h3>Xác nhận công bố ca thi?</h3><p>{active.length} nhóm, {active.reduce((n,g)=>n+g.studentCount,0)} sinh viên. Lịch: {date(detail.startTime)}. Sau công bố, danh sách và phân công được chốt.</p><button disabled={busy} onClick={()=>setConfirmPublish(false)}>Kiểm tra lại</button><button className="org-primary" disabled={busy} onClick={()=>void run(async()=>{setDetail(await request<Sitting>(`${base}/${detail.id}/publish`,{method:'POST',signal:AbortSignal.timeout(60000)}));setConfirmPublish(false);onCreated();},'Đã công bố ca thi. Sinh viên có tên được vào thi đúng giờ.')}>Xác nhận công bố</button></section>}
   <div className="sitting-groups">{detail.groups.map(g=><article key={g.id} className="sitting-group-card"><header><div><h3>{g.roomName||`Nhóm dự thi ${g.number}`}</h3><small>{g.roomCode||'Chưa gán phòng'} · {g.studentCount} sinh viên</small></div><span title={!g.ready?`Còn thiếu: ${g.missing.join(', ')}`:undefined} className={`sitting-status ${g.status==='cancelled'?'cancelled':g.publishedAt?'published':g.ready?'ready':'assignment'}`}>{g.status==='cancelled'?'Đã hủy':g.publishedAt?'Đã công bố':g.ready?'Sẵn sàng':'Chưa sẵn sàng'}</span></header>
    <dl className="sitting-assignment-summary"><div><dt><DoorOpen size={16}/>Phòng thi</dt><dd className={!g.roomCode?'is-missing':undefined}>{g.roomCode?`${g.roomCode} · ${g.roomName}`:'Chưa phân phòng'}</dd></div><div><dt><Users size={16}/>Giảng viên phụ trách</dt><dd className={!g.teacherName?'is-missing':undefined}>{g.teacherName||'Chưa phân công'}</dd></div><div><dt><FileText size={16}/>Đề thi</dt><dd className={!g.examId?'is-missing':undefined}>{g.examId?(g.examStatus==='cancelled'?'Đề đã đóng':g.examTitle):'Chờ giảng viên thêm đề'}</dd></div></dl>
    <div className="sitting-group-actions"><div>{g.status!=='cancelled'&&!g.publishedAt&&<button disabled={busy} onClick={()=>{setAssignment({id:g.id,roomId:String(g.roomId||''),teacherId:String(g.teacherId||'')});setError('');}}>Phân công</button>}{g.examId&&onOpenExam&&<button disabled={busy} onClick={()=>{const id=g.examId!;close();onOpenExam(id);}}>Xem / Quản lý đề</button>}{g.sessionId&&<button disabled={busy} onClick={()=>{const id=g.sessionId!;close();onOpenSession?.(id);}}>Theo dõi sinh viên</button>}</div><label className="org-ai-switch"><input type="checkbox" role="switch" aria-label={`Giám sát AI nhóm ${g.number}`} checked={g.aiEnabled!==false} disabled={busy||g.status==='cancelled'} onChange={e=>{const enabled=e.target.checked;void run(async()=>{setDetail(await request<Sitting>(`${base}/groups/${g.id}/ai-policy?enabled=${enabled}`,{method:'PATCH'}));},enabled?'Đã bật giám sát AI.':'Đã tắt AI cho nhóm này. Bài thi vẫn tiếp tục.');}}/>Giám sát AI {g.aiEnabled!==false?'đang bật':'đã tắt'}</label></div>
    {assignment?.id===g.id&&<form className="sitting-assignment-form" onSubmit={e=>{e.preventDefault();void run(async()=>{setDetail(await request<Sitting>(`${base}/groups/${assignment.id}`,{method:'PUT',body:JSON.stringify({roomId:assignment.roomId?Number(assignment.roomId):null,teacherId:assignment.teacherId?Number(assignment.teacherId):null})}));setAssignment(null);onCreated();},'Đã lưu phân công.');}}><h4>Phân phòng và giảng viên cho nhóm {g.number}</h4><p>Giảng viên được phân công sẽ thêm đề vào ca. Nếu đổi giảng viên, đề cũ của nhóm được gỡ khỏi ca.</p><fieldset disabled={busy}><label>Phòng<select value={assignment.roomId} onChange={e=>setAssignment(a=>a&&({...a,roomId:e.target.value}))}><option value="">Chọn sau</option>{rooms.filter(r=>r.status==='active').map(r=><option key={r.id} value={r.id}>{r.code} · {r.name} · {r.capacity||40} chỗ</option>)}</select></label><label>Giảng viên<select value={assignment.teacherId} onChange={e=>setAssignment(a=>a&&({...a,teacherId:e.target.value}))}><option value="">Chọn sau</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label></fieldset><footer><button type="button" disabled={busy} onClick={()=>setAssignment(null)}>Hủy</button><button className="org-primary" disabled={busy}>Lưu phân công</button></footer></form>}
    <details className="sitting-roster-panel"><summary>Danh sách {g.studentCount} sinh viên</summary><ol className="sitting-roster">{g.students.map(s=><li key={s.id}><span>{s.name}<small>{s.username} · {s.className||'Chưa có lớp'}{s.releasedAt?' · Đã trả về danh sách chưa xếp':''}</small></span></li>)}</ol></details>
    {g.status!=='cancelled'&&<button className="sitting-cancel-link" disabled={busy} onClick={()=>setCancelId(g.id)}>Hủy nhóm dự thi này</button>}
    {cancelId===g.id&&<div className="org-error" role="alert"><p>Hủy nhóm {g.number}? Lịch sử được giữ lại; sinh viên chưa có bài làm được trả về danh sách chưa xếp.</p><button disabled={busy} onClick={()=>setCancelId(null)}>Giữ nhóm</button><button disabled={busy} onClick={()=>void run(async()=>{setDetail(await request<Sitting>(`${base}/groups/${g.id}/cancel`,{method:'POST'}));setCancelId(null);onCreated();},'Đã hủy nhóm dự thi.')}>Xác nhận hủy</button></div>}
   </article>)}</div>
   </div>
   <footer className="sitting-detail-footer"><span>{active.length} nhóm dự thi <i>·</i> {active.reduce((n,g)=>n+g.studentCount,0)} sinh viên</span><button type="button" onClick={close} disabled={busy}>Đóng chi tiết</button></footer>
  </>}</dialog>
 </div>;
}
