import { useEffect, useState } from 'react';
import { ArrowLeft, Eye, RefreshCw, ShieldAlert } from 'lucide-react';
import { apiFetch } from '@shared/services/api';
import { examDate } from '@shared/utils/examTime';
import { startVisiblePolling } from '@shared/utils/visiblePolling';
import { EvidenceTimeline } from '@shared/features/evidence/components/EvidenceTimeline';
import { evidenceApi } from '@shared/features/evidence/services/evidenceApi';
import type { RosterDetail } from '@shared/features/sessions/components/SessionRosterPanel';
import type { LiveSessionRow } from '@shared/features/sessions/components/LiveSessionBoard';
import { TeacherDialog, TeacherEmpty, TeacherHeading, TeacherLoading, TeacherNotice } from '../../../layouts/lecturer/TeacherUI';
import './TeacherWarningsPage.css';

interface WarningSession extends LiveSessionRow { browserEvents: number; aiEvents: number }
interface WarningPage { items: WarningSession[]; total: number; serverTime: string }
const date = (value?: string) => value ? examDate(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
const attemptLabels: Record<string,string> = { in_progress:'Đang làm bài', submitted:'Đã nộp bài', completed:'Đã nộp bài', expired:'Hết hạn', cancelled:'Đã hủy' };

function useWarningData<T>(path: string, revision: number, enabled: boolean, request: typeof apiFetch) {
  const [snapshot,setSnapshot] = useState<{path:string;value:T}|null>(null);
  const [failure,setFailure] = useState<{path:string;message:string}|null>(null);
  const [refreshing,setRefreshing] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    return startVisiblePolling(async signal => {
      setRefreshing(true);
      try {
        const value = await request<T>(path, { signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]) });
        if (!signal.aborted) { setSnapshot({path,value}); setFailure(null); }
      } catch (cause) {
        if (!signal.aborted) setFailure({path,message:cause instanceof Error ? cause.message : 'Chưa tải được cảnh báo ca thi.'});
      } finally { if (!signal.aborted) setRefreshing(false); }
    }, {interval:10000});
  }, [path,revision,enabled,request]);
  return { data:snapshot?.path===path ? snapshot.value : null, error:failure?.path===path ? failure.message : '', refreshing };
}

export function TeacherWarningsPage({request=apiFetch,evidence=evidenceApi}:{request?:typeof apiFetch;evidence?:typeof evidenceApi}) {
  const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[live,setLive]=useState(false),[page,setPage]=useState(0),[revision,setRevision]=useState(0);
  const [selected,setSelected]=useState<number|null>(()=>{const id=Number(new URLSearchParams(window.location.search).get('warningSession'));return Number.isSafeInteger(id)&&id>0?id:null;});
  const [studentQuery,setStudentQuery]=useState(''),[studentPage,setStudentPage]=useState(0),[attempt,setAttempt]=useState<{id:number;name:string}|null>(null);
  const list=useWarningData<WarningPage>(`/teacher/monitoring/warning-sessions?${new URLSearchParams({q:search,live:String(live),page:String(page),size:'20'})}`,revision,selected===null,request);
  const detail=useWarningData<RosterDetail>(`/teacher/monitoring/warning-sessions/${selected}`,revision,selected!==null,request);
  useEffect(()=>{if(list.data){const last=Math.max(0,Math.ceil(list.data.total/20)-1);if(page>last)setPage(last);}},[list.data,page]);
  function choose(id:number|null) {
    setSelected(id);setAttempt(null);setStudentQuery('');setStudentPage(0);
    const url=new URL(window.location.href);
    if(id)url.searchParams.set('warningSession',String(id));else url.searchParams.delete('warningSession');
    window.history.replaceState(window.history.state,'',url);
  }
  const current=selected===null?list:detail;
  const fold=(text:string)=>text.normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/đ/g,'d').toLowerCase();
  const students=(detail.data?.roster??[]).filter(row=>(row.warningCount??0)>0&&fold(`${row.name??''} ${row.username??''} ${row.className??''}`).includes(fold(studentQuery)));
  const lastStudentPage=Math.max(0,Math.ceil(students.length/20)-1),currentStudentPage=Math.min(studentPage,lastStudentPage);
  return <section className="teacher-warnings">
    <TeacherHeading eyebrow="Khảo thí" title="Cảnh báo ca thi" description="Xem cảnh báo và bằng chứng trong những ca bạn được phân công coi thi." actions={<button className="t-button" disabled={current.refreshing} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={15} className={current.refreshing?'animate-spin':''}/>Làm mới</button>}/>
    <div className="teacher-warning-update"><i/>Tự cập nhật mỗi 10 giây</div>
    {selected!==null&&<div className="teacher-warning-context"><button className="t-button" onClick={()=>choose(null)}><ArrowLeft size={15}/>Danh sách ca có cảnh báo</button><strong>{detail.data?.session?.name??'Sinh viên có cảnh báo'}</strong></div>}
    {current.error&&<TeacherNotice>{current.error}<button className="t-link" onClick={()=>setRevision(value=>value+1)}>Thử lại</button></TeacherNotice>}
    {selected===null?<>
      <form className="t-filters" onSubmit={event=>{event.preventDefault();setSearch(query.trim());setPage(0);setRevision(value=>value+1);}}><input aria-label="Tìm ca có cảnh báo" placeholder="Tên ca, phòng hoặc học phần…" value={query} maxLength={160} onChange={event=>setQuery(event.target.value)}/><select aria-label="Phạm vi ca có cảnh báo" value={live?'live':'all'} onChange={event=>{setLive(event.target.value==='live');setPage(0);}}><option value="all">Tất cả ca có cảnh báo</option><option value="live">Ca đang diễn ra</option></select><button className="t-button">Tìm kiếm</button></form>
      {!list.data?!list.error&&<TeacherLoading/>:!list.data.items.length?<TeacherEmpty title="Chưa có ca thi có cảnh báo" description="Những ca được phân công có cảnh báo sẽ xuất hiện tại đây."/>:<>
        <div className="t-table"><table><thead><tr><th>Ca thi / Phòng</th><th>Đề thi / Học phần</th><th>Thời gian thi</th><th>Sinh viên có cảnh báo</th><th>Cảnh báo</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead><tbody>{list.data.items.map(row=><tr key={row.id}><td><strong>{row.name}</strong><small>{[row.roomCode,row.roomName].filter(Boolean).join(' · ')||'Chưa có phòng'}</small></td><td><strong>{row.examCode}</strong><small>{row.courseCode} · {row.examTitle}</small></td><td>{date(row.startTime)}<small>Đến {date(row.endTime)}</small></td><td><span className="teacher-warning-count">{row.warnedAttempts??0}</span></td><td><span className="teacher-warning-tag"><ShieldAlert size={14}/>{row.browserEvents??0} trình duyệt · {row.aiEvents??0} AI</span></td><td><span className={`teacher-warning-stage ${row.status??''}`}>{({ongoing:'Đang thi',completed:'Đã kết thúc',cancelled:'Đã hủy',scheduled:'Sắp diễn ra'} as Record<string,string>)[row.status??'']??'Chưa xác định'}</span></td><td><button className="t-button" onClick={()=>choose(row.id)}><Eye size={15}/>Xem sinh viên</button></td></tr>)}</tbody></table></div>
        <div className="t-pager"><span>{list.data.total} ca có cảnh báo · Trang {page+1}/{Math.max(1,Math.ceil(list.data.total/20))}</span><div className="t-actions"><button className="t-button" disabled={page===0||list.refreshing} onClick={()=>setPage(value=>value-1)}>Trước</button><button className="t-button" disabled={(page+1)*20>=list.data!.total||list.refreshing} onClick={()=>setPage(value=>value+1)}>Tiếp</button></div></div>
      </>}
    </>:<>
      <form className="t-filters" onSubmit={event=>event.preventDefault()}><input aria-label="Tìm sinh viên có cảnh báo" placeholder="Tên sinh viên, mã sinh viên hoặc lớp…" value={studentQuery} onChange={event=>{setStudentQuery(event.target.value);setStudentPage(0);}}/><span>{students.length} sinh viên có cảnh báo</span></form>
      {!detail.data?!detail.error&&<TeacherLoading text="Đang tải sinh viên có cảnh báo…"/>:!students.length?<TeacherEmpty title="Không có sinh viên phù hợp" description="Thử đổi từ khóa tìm kiếm hoặc làm mới dữ liệu."/>:<>
        <div className="t-table"><table><thead><tr><th>Sinh viên</th><th>Lớp / Khoa</th><th>Trạng thái bài thi</th><th>Cảnh báo</th><th>Thời gian</th><th>Bằng chứng</th></tr></thead><tbody>{students.slice(currentStudentPage*20,(currentStudentPage+1)*20).map(row=><tr key={row.id}><td><strong>{row.name}</strong><small>Mã SV: {row.username}</small></td><td>{row.className??'Chưa có lớp'}<small>{row.department}</small></td><td>{attemptLabels[row.attemptStatus??'']??'Chưa vào thi'}</td><td><span className={`teacher-warning-tag ${['HIGH','CRITICAL'].includes(row.riskLevel??'')?'high':''}`}><ShieldAlert size={14}/>{row.warningCount} cảnh báo{['HIGH','CRITICAL'].includes(row.riskLevel??'')?' · Cần xem xét cao':''}</span></td><td>{date(row.startedAt)}<small>Nộp bài: {date(row.submittedAt)}</small></td><td>{row.attemptId&&<button className="t-button" onClick={()=>setAttempt({id:row.attemptId!,name:row.name??'Sinh viên'})}><Eye size={15}/>Xem bằng chứng</button>}</td></tr>)}</tbody></table></div>
        {students.length>20&&<div className="t-pager"><span>Trang {currentStudentPage+1}/{lastStudentPage+1}</span><div className="t-actions"><button className="t-button" disabled={currentStudentPage===0} onClick={()=>setStudentPage(currentStudentPage-1)}>Trước</button><button className="t-button" disabled={currentStudentPage===lastStudentPage} onClick={()=>setStudentPage(currentStudentPage+1)}>Tiếp</button></div></div>}
      </>}
    </>}
    {attempt&&<TeacherDialog title={`Cảnh báo · ${attempt.name}`} description={`Diễn biến và ảnh bằng chứng · Lượt thi #${attempt.id}`} onClose={()=>setAttempt(null)}><div className="t-dialog-body"><EvidenceTimeline attemptId={attempt.id} audience="teacher" api={evidence}/></div></TeacherDialog>}
  </section>;
}
