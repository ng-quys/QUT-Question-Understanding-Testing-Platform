import {useEffect,useRef,useState} from 'react';
import {apiFetch} from '@shared/services/api';
import type {AiQuota} from '@shared/features/ai-generator/services/aiCreditsService';

interface Teacher {id:number;full_name:string;email:string;quota:AiQuota}
interface RecoveryPreview {id:number;fingerprint:string;currentRegistry:string;accepted:number;release:number;questions:Array<{content:string}>}
interface Entry {
  id:number;event_type:string;monthly_used_delta:number;extra_balance_delta:number;
  monthly_reserved_delta:number;extra_reserved_delta:number;monthly_limit_delta:number;
  reason:string|null;created_at:string;actor_name:string|null;job_id:number|null;
}
export function AiCreditsAdmin(){
  const [query,setQuery]=useState(''),[page,setPage]=useState(0),[revision,setRevision]=useState(0);
  const [rows,setRows]=useState<Teacher[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [teacher,setTeacher]=useState<Teacher|null>(null),[entries,setEntries]=useState<Entry[]>([]);
  const [amount,setAmount]=useState(''),[reason,setReason]=useState(''),[message,setMessage]=useState('');
  const [confirmed,setConfirmed]=useState(false),[historyBusy,setHistoryBusy]=useState(false);
  const operation=useRef<{signature:string;key:string}|null>(null);
  const waiting=useRef(false);
  const [recovery,setRecovery]=useState<RecoveryPreview|null>(null);
  const previewRecovery=async()=>{
    const job=teacher?.quota.activeJob;if(!job||waiting.current)return;
    waiting.current=true;setBusy(true);setRecovery(null);setConfirmed(false);
    try{setRecovery(await apiFetch<RecoveryPreview>('/admin/ai-credits/jobs/'+job.id+'/checkpoint-recovery'));setError('');}
    catch(e){setError(e instanceof Error?e.message:'Chưa đủ điều kiện phục hồi.');}
    finally{waiting.current=false;setBusy(false);}
  };
  const recoverCheckpoint=async()=>{
    if(!teacher||!recovery||!confirmed||!reason.trim()||waiting.current)return;
    waiting.current=true;setBusy(true);
    try{
      await apiFetch('/admin/ai-credits/jobs/'+recovery.id+'/checkpoint-recovery',{method:'POST',body:JSON.stringify({
        confirmedStopped:confirmed,fingerprint:recovery.fingerprint,currentRegistry:recovery.currentRegistry,reason:reason.trim()})});
      setMessage('Đã kết thúc job theo checkpoint, tính credits cho câu hợp lệ và giải phóng phần còn lại.');
      setRecovery(null);setConfirmed(false);setError('');setRevision(v=>v+1);await history(teacher);
    }catch(e){setRecovery(null);setConfirmed(false);setError(e instanceof Error?e.message:'Không phục hồi được job; hãy kiểm tra lại.');}
    finally{waiting.current=false;setBusy(false);}
  };
  useEffect(()=>{
    const refresh=()=>setRevision(v=>v+1);
    window.addEventListener('examflow-admin-ai-credits-refresh',refresh);
    return ()=>window.removeEventListener('examflow-admin-ai-credits-refresh',refresh);
  },[]);
  useEffect(()=>{
    let active=true;
    const timer=setTimeout(()=>{
      setBusy(true);
      void apiFetch<{items:Teacher[]}>('/admin/ai-credits?q='+encodeURIComponent(query)+'&page='+page+'&size=20')
        .then(data=>{if(active){setRows(data.items);setError('');}})
        .catch(e=>{if(active){setRows([]);setError(e instanceof Error?e.message:'Không tải được quota.');}})
        .finally(()=>{if(active)setBusy(false);});
    },250);
    return ()=>{active=false;clearTimeout(timer);};
  },[query,page,revision]);
  useEffect(()=>{
    if(teacher)setTeacher(rows.find(r=>r.id===teacher.id) || teacher);
  },[rows]);
  const history=async(user:Teacher,before?:number)=>{
    if(historyBusy)return;
    setHistoryBusy(true);
    try{
      const data=await apiFetch<Entry[]>('/admin/ai-credits/'+user.id+'/history?size=30'+(before?'&before='+before:''));
      setTeacher(user);setEntries(old=>before?[...old,...data]:data);setError('');
    }catch(e){setError(e instanceof Error?e.message:'Không tải được lịch sử.');}
    finally{setHistoryBusy(false);}
  };
  const grant=async()=>{
    if(!teacher||waiting.current||!reason.trim())return;
    waiting.current=true;setBusy(true);setMessage('');
    const signature=JSON.stringify([teacher.id,Number(amount),reason.trim()]);
    if(operation.current?.signature!==signature)operation.current={signature,key:crypto.randomUUID()};
    try{
      await apiFetch('/admin/ai-credits/'+teacher.id+'/grants',{method:'POST',
        body:JSON.stringify({operationKey:operation.current.key,amount:Number(amount),reason:reason.trim()})});
      setMessage('Đã cấp thêm credits.');setAmount('');setReason('');operation.current=null;setRevision(v=>v+1);
      await history(teacher);
    }catch(e){setError(e instanceof Error?e.message:'Không cấp được credits. Retry giữ nguyên operation key.');}
    finally{waiting.current=false;setBusy(false);}
  };
  const reconcile=async()=>{
    const job=teacher?.quota.activeJob;
    if(!job||!confirmed||!reason.trim()||waiting.current)return;
    waiting.current=true;setBusy(true);
    try{
      await apiFetch('/admin/ai-credits/jobs/'+job.id+'/reconcile',{method:'POST',
        body:JSON.stringify({confirmedStopped:confirmed,reason:reason.trim()})});
      setMessage('Đã đối soát job theo kết quả đã lưu.');setRevision(v=>v+1);setConfirmed(false);await history(teacher!);
    }catch(e){setError(e instanceof Error?e.message:'Không đối soát được job.');}
    finally{waiting.current=false;setBusy(false);}
  };
  const time=(value:string)=>new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
  return <section className="space-y-4 font-sans">
    <div><h2 className="text-xl font-bold">Quản lý AI Credits</h2><p className="mt-1 text-xs text-slate-500">Hạn mức tháng, credits cấp thêm và lịch sử tác vụ AI.</p></div>
    {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {message&&<p role="status" className="text-sm text-emerald-700">{message}</p>}
    <div className="flex gap-2"><input aria-label="Tìm giảng viên theo tên hoặc email" className="flex-1 rounded-lg border px-3 py-2 text-sm" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="Tìm giảng viên theo tên/email"/>
      <button disabled={busy} onClick={()=>setRevision(v=>v+1)} className="rounded-lg border px-3 text-sm">Làm mới</button></div>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>
      {['Giảng viên','Đã dùng / tháng','Giữ chỗ','Cấp thêm','Khả dụng','Job',''].map(text=><th key={text} className="p-3">{text}</th>)}
    </tr></thead><tbody>{rows.map(user=><tr key={user.id} className="border-t"><td className="p-3"><b>{user.full_name}</b><p className="text-xs text-slate-500">{user.email}</p></td>
      <td className="p-3">{user.quota.used}/{user.quota.monthlyLimit}</td><td className="p-3">{user.quota.reserved+user.quota.extraReserved}</td>
      <td className="p-3">{user.quota.extraBalance}</td><td className="p-3">{user.quota.remaining}</td>
      <td className="p-3 text-xs">{user.quota.activeJob ? '#'+user.quota.activeJob.id+' · '+user.quota.activeJob.status : '—'}</td>
      <td className="p-3"><button disabled={historyBusy||busy} onClick={()=>{setAmount('');setReason('');setConfirmed(false);setRecovery(null);void history(user);}} className="rounded-lg border px-3 py-1">Chi tiết</button></td></tr>)}</tbody></table>
      {!rows.length&&!busy&&<p className="p-5 text-sm text-slate-500">Không có dữ liệu quota.</p>}</div>
    <div className="flex items-center justify-end gap-3 text-sm"><button disabled={page===0||busy} onClick={()=>setPage(v=>v-1)}>Trước</button><span>Trang {page+1}</span><button disabled={rows.length<20||busy} onClick={()=>setPage(v=>v+1)}>Sau</button></div>
    {teacher&&<div className="space-y-4 rounded-xl border bg-white p-4">
      <h3 className="font-bold">{teacher.full_name} · {teacher.email}</h3>
      <div className="flex flex-wrap gap-3 text-sm">
        <input aria-label="Số credits cấp thêm" type="number" min={1} max={1000000} value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Số credits" className="rounded-lg border p-2"/>
        <input aria-label="Lý do cấp thêm hoặc đối soát" value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)} placeholder="Lý do" className="min-w-48 flex-1 rounded-lg border p-2"/>
        <button disabled={busy||!reason.trim()||!Number.isInteger(Number(amount))||Number(amount)<1||Number(amount)>1000000} onClick={()=>void grant()} className="rounded-lg px-4 py-2 text-white disabled:opacity-50" style={{background:'var(--primary)'}}>Cấp thêm</button>
      </div>
      {teacher.quota.activeJob?.status==='unknown'&&<div className="rounded-lg border border-amber-200 p-3 text-sm space-y-2">
        <p>Job #{teacher.quota.activeJob.id} cần đối soát. Chỉ xác nhận sau khi đã kiểm tra tác vụ upstream cũ thực sự dừng.</p>
        <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Tôi đã xác minh tác vụ cũ đã dừng.</label>
        <button disabled={!confirmed||!reason.trim()||busy} onClick={()=>void reconcile()} className="rounded-lg border px-3 py-2 disabled:opacity-50">Đối soát theo kết quả đã lưu</button>
      </div>}
      {teacher.quota.activeJob&&['cancel_requested','unknown'].includes(teacher.quota.activeJob.status)&&<div className="rounded-lg border border-amber-200 p-3 text-sm space-y-2">
        <p>Phục hồi job đã yêu cầu hủy khi execution registry cũ bị mất. Chỉ dùng sau khi xác minh tiến trình cũ đã dừng.</p>
        <button disabled={busy} onClick={()=>void previewRecovery()} className="rounded-lg border px-3 py-2">Kiểm tra checkpoint để kết thúc job</button>
        {recovery&&<div className="space-y-2">
          <p>Job #{recovery.id}: giữ {recovery.accepted} câu, tính {recovery.accepted} credits, giải phóng {recovery.release} credits.</p>
          <ol className="list-decimal pl-5">{recovery.questions.map((q,i)=><li key={i}>{q.content}</li>)}</ol>
          <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Tôi đã xác minh tiến trình giữ execution cũ đã dừng và chấp nhận kết quả checkpoint.</label>
          <button disabled={!confirmed||!reason.trim()||busy} onClick={()=>void recoverCheckpoint()} className="rounded-lg border px-3 py-2 disabled:opacity-50">Kết thúc job và quyết toán theo checkpoint</button>
        </div>}
      </div>}
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{['Thời gian','Thao tác','Tháng: dùng / giữ chỗ','Extra: số dư / giữ chỗ','Người cấp/đối soát','Lý do'].map(text=><th key={text} className="p-2">{text}</th>)}</tr></thead><tbody>
        {entries.map(entry=><tr key={entry.id} className="border-t"><td className="p-2">{time(entry.created_at)}</td><td className="p-2">{entry.event_type}{entry.job_id?' · #'+entry.job_id:''}</td>
          <td className="p-2">{entry.monthly_used_delta} / {entry.monthly_reserved_delta}{entry.monthly_limit_delta?' · cấp '+entry.monthly_limit_delta:''}</td>
          <td className="p-2">{entry.extra_balance_delta} / {entry.extra_reserved_delta}</td><td className="p-2">{entry.actor_name||'Hệ thống'}</td><td className="p-2">{entry.reason||'—'}</td></tr>)}
      </tbody></table></div>
      <button disabled={historyBusy||entries.length===0||entries.length%30!==0} onClick={()=>void history(teacher,entries.at(-1)?.id)} className="text-xs underline disabled:opacity-50">Xem lịch sử cũ hơn</button>
    </div>}
  </section>;
}
