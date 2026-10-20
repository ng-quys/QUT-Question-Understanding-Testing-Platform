import { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../../services/api';
import { TeacherDialog, TeacherHeading, TeacherLoading, TeacherNotice } from '../../../layouts/lecturer/TeacherUI';
import { LiveSessionBoard, type LiveSessionRow } from '../components/LiveSessionBoard';
import { SessionRosterPanel, type RosterDetail } from '../components/SessionRosterPanel';
import { EvidenceTimeline } from '../../evidence/components/EvidenceTimeline';
import '../components/organization.css';

interface Page {items:LiveSessionRow[];total:number;serverTime:string}
const errorText=(cause:unknown)=>cause instanceof Error?cause.message:'Chưa tải được dữ liệu giám sát.';
export function TeacherMonitoringPage(){
  const [data,setData]=useState<Page|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  const [live,setLive]=useState(true),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0);
  const [selected,setSelected]=useState<number|null>(()=>{const id=Number(new URLSearchParams(window.location.search).get('session'));return Number.isSafeInteger(id)&&id>0?id:null;});
  const [detail,setDetail]=useState<RosterDetail|null>(null),[detailError,setDetailError]=useState(''),[detailLoading,setDetailLoading]=useState(false),[detailRevision,setDetailRevision]=useState(0),[attempt,setAttempt]=useState<number|null>(null);
  useEffect(()=>{
    let active=true,timer:ReturnType<typeof setTimeout>;const abort=new AbortController();
    const load=async()=>{if(document.hidden){timer=setTimeout(load,8000);return;}setLoading(true);try{const result=await apiFetch<Page>(`/teacher/monitoring/sessions?live=${live}&q=${encodeURIComponent(search)}&page=${page}&size=20`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});if(active){setData(result);setError('');}}catch(cause){if(active)setError(errorText(cause));}finally{if(active){setLoading(false);timer=setTimeout(load,8000);}}};
    setData(null);void load();return()=>{active=false;abort.abort();clearTimeout(timer);};
  },[live,search,page,revision]);
  useEffect(()=>{
    setDetail(null);setDetailError('');if(!selected)return;
    let active=true,timer:ReturnType<typeof setTimeout>;const abort=new AbortController();
    const load=async()=>{setDetailLoading(true);try{const result=await apiFetch<RosterDetail>(`/teacher/monitoring/sessions/${selected}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});if(active){setDetail(result);setDetailError('');}}catch(cause){if(active){setDetail(null);setDetailError(errorText(cause));}}finally{if(active){setDetailLoading(false);timer=setTimeout(()=>{if(!document.hidden)void load();else timer=setTimeout(load,8000);},8000);}}};
    void load();return()=>{active=false;abort.abort();clearTimeout(timer);};
  },[selected,detailRevision]);
  function choose(id:number|null){setAttempt(null);setSelected(id);const url=new URL(window.location.href);if(id)url.searchParams.set('session',String(id));else url.searchParams.delete('session');window.history.replaceState(window.history.state,'',url);}
  return <section><TeacherHeading eyebrow="Khảo thí" title="Giám sát ca thi" description="Theo dõi thí sinh, tiến độ nộp bài và cảnh báo trong những ca bạn được phân công." actions={<button className="t-button" disabled={loading} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={15}/>Làm mới</button>}/>
    {error&&<TeacherNotice>{error}</TeacherNotice>}
    {selected?<><button className="t-button mb-5" onClick={()=>choose(null)}><ArrowLeft size={16}/>Danh sách ca giám sát</button>{detailError?<TeacherNotice>{detailError}<button className="t-link" onClick={()=>setDetailRevision(value=>value+1)}>Thử lại</button></TeacherNotice>:!detail?<TeacherLoading text="Đang tải danh sách thí sinh…"/>:<div className="exam-org"><SessionRosterPanel detail={detail} busy={detailLoading} onRefresh={()=>setDetailRevision(value=>value+1)} onAttempt={setAttempt}/></div>}</>:<>
      <form className="t-filters" onSubmit={event=>{event.preventDefault();setSearch(query);setPage(0);}}><input aria-label="Tìm ca giám sát" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Tìm tên ca, phòng hoặc học phần…"/><select aria-label="Phạm vi ca giám sát" value={live?'live':'all'} onChange={event=>{setLive(event.target.value==='live');setPage(0);}}><option value="live">Ca đang diễn ra</option><option value="all">Tất cả ca đã công bố</option></select><button className="t-button">Tìm kiếm</button></form>
      {!data&&loading?<TeacherLoading/>:data&&<div className="exam-org"><LiveSessionBoard rows={data.items} serverTime={data.serverTime} loading={loading} busy={false} onDetail={choose} readOnly liveOnly={live}/><div className="t-pager"><span>{data.total} ca được phân công · Trang {page+1}/{Math.max(1,Math.ceil(data.total/20))}</span><div className="t-actions"><button className="t-button" disabled={loading||page===0} onClick={()=>setPage(value=>value-1)}>Trước</button><button className="t-button" disabled={loading||(page+1)*20>=data.total} onClick={()=>setPage(value=>value+1)}>Tiếp</button></div></div></div>}
    </>}
    {attempt&&<TeacherDialog title="Lượt thi và cảnh báo" description="Diễn biến giám sát của sinh viên trong ca được phân công." onClose={()=>setAttempt(null)}><div className="t-dialog-body"><EvidenceTimeline attemptId={attempt} audience="teacher"/></div></TeacherDialog>}
  </section>;
}
