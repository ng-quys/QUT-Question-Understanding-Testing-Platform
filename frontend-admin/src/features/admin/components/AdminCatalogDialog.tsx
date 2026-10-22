import { DateTime24Field } from '../../../shared/components/DateTime24Field';
import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, RefreshCw, Save } from 'lucide-react';
import type { CatalogKind, CatalogOptions, WorkspaceApi } from '../services/adminWorkspaceApi';
import { Empty, Loading, Modal, Notice } from './AdminUI';

const names: Record<CatalogKind,string> = { courses:'học phần', exams:'đề thi', sessions:'ca thi' };
const initial = { code:'',name:'',title:'',credits:'3',department:'',description:'',teacherId:'',status:'active',courseId:'',totalQuestions:'20',mediumPercent:'50',goodPercent:'30',excellentPercent:'20',maxOverlapPercent:'100',shuffleQuestions:true,shuffleAnswers:true,antiCheatMode:true,examId:'',classId:'',startTime:'',endTime:'' };
type Draft = typeof initial;
const localTime = (input: string) => input ? input.slice(0,16) : '';

export function AdminCatalogDialog({ kind, id, api, onClose, onSaved }: { kind:CatalogKind; id:number|null; api:WorkspaceApi; onClose:()=>void; onSaved:(message:string)=>void }) {
  const [draft,setDraft]=useState<Draft>({...initial});
  const [options,setOptions]=useState<CatalogOptions|null>(null);
  const [loading,setLoading]=useState(true), [busy,setBusy]=useState(false);
  const [error,setError]=useState(''), [loadError,setLoadError]=useState(''), [revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;setLoading(true);setLoadError('');setError('');
    Promise.all([api.catalogOptions(),id===null?Promise.resolve(null):api.catalogDetail(kind,id)]).then(([lookups,row])=>{
      if(!active)return;setOptions(lookups);
      const next={...initial};
      if(row) for(const key of Object.keys(next) as Array<keyof Draft>) {
        if(row[key]!=null) { const value=typeof initial[key]==='boolean'?Boolean(row[key]):String(row[key]); Object.assign(next,{[key]:value}); }
      }
      next.startTime=localTime(next.startTime);next.endTime=localTime(next.endTime);setDraft(next);
    }).catch(cause=>{if(active)setLoadError(cause instanceof Error?cause.message:'Không tải được biểu mẫu');}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[api,kind,id,revision]);
  function update<K extends keyof Draft>(key:K,value:Draft[K]){setDraft(previous=>({...previous,[key]:value}));setError('');}
  async function submit(event:FormEvent){
    event.preventDefault();if(busy||loading||!options)return;
    const common={name:draft.name.trim()};
    let body:Record<string,unknown>;
    if(kind==='courses') body={...common,credits:Number(draft.credits),department:draft.department.trim(),description:draft.description.trim(),teacherId:Number(draft.teacherId),status:draft.status};
    else if(kind==='exams') {
      body={title:draft.title.trim(),shuffleQuestions:draft.shuffleQuestions,shuffleAnswers:draft.shuffleAnswers};
      if(id===null){
        if(Math.abs(Number(draft.mediumPercent)+Number(draft.goodPercent)+Number(draft.excellentPercent)-100)>.001){setError('Tổng tỷ lệ ba mức độ khó phải bằng 100%.');return;}
        Object.assign(body,{courseId:Number(draft.courseId),totalQuestions:Number(draft.totalQuestions),mediumPercent:Number(draft.mediumPercent),goodPercent:Number(draft.goodPercent),excellentPercent:Number(draft.excellentPercent),maxOverlapPercent:Number(draft.maxOverlapPercent),cloIds:[],antiCheatMode:draft.antiCheatMode});
      }
    } else {
      if(draft.endTime<=draft.startTime){setError('Giờ kết thúc phải sau giờ bắt đầu.');return;}
      body={...common,examId:Number(draft.examId),classId:draft.classId?Number(draft.classId):null,startTime:draft.startTime,endTime:draft.endTime};
    }
    setBusy(true);setError('');
    try{await api.saveCatalog(kind,id,body);onSaved(`Đã ${id===null?'thêm':'cập nhật'} ${names[kind]}.`);}
    catch(cause){setError(cause instanceof Error?cause.message:'Không thể lưu dữ liệu. Vui lòng thử lại.');}
    finally{setBusy(false);}
  }
  const codeField=()=><label>{kind==='courses'?'Mã môn học':kind==='exams'?'Mã đề thi':'Mã ca thi'}<input readOnly value={id===null?'Tự động cấp khi lưu':draft.code}/><small>{id===null?'Hệ thống cấp mã ngắn, duy nhất.':'Mã được giữ nguyên khi chỉnh sửa.'}</small></label>;
  const checkbox=(key:'shuffleQuestions'|'shuffleAnswers'|'antiCheatMode',label:string)=><label className="admin-catalog-check"><input type="checkbox" checked={draft[key]} onChange={e=>update(key,e.target.checked)}/>{label}</label>;
  return <Modal title={`${id===null?'Thêm':'Sửa'} ${names[kind]}`} description={kind==='sessions'?'Mã ca thi là mã duy nhất sinh viên dùng để vào thi.':kind==='exams'?'Đề mới được tạo ở trạng thái nháp từ ngân hàng câu hỏi đã duyệt.':'Thông tin học phần và giảng viên phụ trách.'} onClose={onClose} busy={busy} wide>
    {loading?<div className="admin-modal-body"><Loading text="Đang tải biểu mẫu…"/></div>:loadError?<div className="admin-modal-body"><Empty title="Chưa tải được biểu mẫu" description={loadError} action={<button className="admin-button secondary" onClick={()=>setRevision(v=>v+1)}><RefreshCw size={15}/>Thử lại</button>}/></div>:<form className="admin-form" onSubmit={submit} aria-busy={busy}>
      <div className="admin-modal-body">{error&&<Notice>{error}</Notice>}<fieldset className="admin-catalog-fields" disabled={busy}><div className="admin-form-grid">
        {codeField()}
        {kind==='courses'&&<>
          <label>Tên học phần<input required maxLength={200} value={draft.name} onChange={e=>update('name',e.target.value)}/></label>
          <label>Số tín chỉ<input required type="number" min={1} max={30} value={draft.credits} onChange={e=>update('credits',e.target.value)}/></label>
          <label>Khoa / đơn vị<input maxLength={100} value={draft.department} onChange={e=>update('department',e.target.value)}/></label>
          <label>Giảng viên phụ trách<select required value={draft.teacherId} onChange={e=>update('teacherId',e.target.value)}><option value="">Chọn giảng viên</option>{draft.teacherId&&!options?.teachers.some(t=>String(t.id)===draft.teacherId)&&<option value={draft.teacherId}>Giảng viên #{draft.teacherId} không còn hoạt động — chọn lại</option>}{options?.teachers.map(t=><option key={t.id} value={t.id}>{t.name} · {t.code}</option>)}</select><small>Giảng viên được chọn sẽ quản lý nội dung và xem lượt thi của học phần.</small></label>
          <label>Trạng thái<select value={draft.status} onChange={e=>update('status',e.target.value)}><option value="active">Hoạt động</option><option value="inactive">Ngưng hoạt động</option></select></label>
          <label className="full">Mô tả<textarea rows={3} maxLength={4000} value={draft.description} onChange={e=>update('description',e.target.value)}/></label>
        </>}
        {kind==='exams'&&<>
          <label>Tên đề thi<input required maxLength={200} value={draft.title} onChange={e=>update('title',e.target.value)}/></label>
          {id===null&&<label>Học phần<select required value={draft.courseId} onChange={e=>update('courseId',e.target.value)}><option value="">Chọn học phần</option>{options?.courses.map(c=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></label>}
          <p className="admin-catalog-help full">Thời gian làm bài lấy theo giờ bắt đầu và kết thúc của ca thi.</p>
          {id===null&&<>
            <label>Số câu hỏi<input required type="number" min={1} max={500} value={draft.totalQuestions} onChange={e=>update('totalQuestions',e.target.value)}/></label>
            <label>Trùng tối đa với đề hiện có (%)<input required type="number" min={0} max={100} value={draft.maxOverlapPercent} onChange={e=>update('maxOverlapPercent',e.target.value)}/></label>
            <label>Trung bình (%)<input required type="number" min={0} max={100} value={draft.mediumPercent} onChange={e=>update('mediumPercent',e.target.value)}/></label>
            <label>Khá (%)<input required type="number" min={0} max={100} value={draft.goodPercent} onChange={e=>update('goodPercent',e.target.value)}/></label>
            <label>Giỏi (%)<input required type="number" min={0} max={100} value={draft.excellentPercent} onChange={e=>update('excellentPercent',e.target.value)}/></label>
            <p className="admin-catalog-help full">Tổng tỷ lệ độ khó phải bằng 100%. Hệ thống lấy câu hỏi đã duyệt và báo rõ nếu ngân hàng không đủ. Tổng điểm đề mới: 10.</p>
          </>}
          <div className="admin-catalog-checks full">{checkbox('shuffleQuestions','Trộn thứ tự câu hỏi')}{checkbox('shuffleAnswers','Trộn thứ tự đáp án')}{id===null&&checkbox('antiCheatMode','Bật giám sát AI')}</div>
          {id!==null&&<p className="admin-catalog-help full">Chỉ sửa đề nháp chưa có ca thi/bài làm. Danh sách câu hỏi và điểm được giữ nguyên.</p>}
        </>}
        {kind==='sessions'&&<>
          <label>Tên ca thi<input required maxLength={200} value={draft.name} onChange={e=>update('name',e.target.value)}/></label>
          <label>Đề thi<select required disabled={id!==null} value={draft.examId} onChange={e=>update('examId',e.target.value)}><option value="">Chọn đề thi có câu hỏi</option>{draft.examId&&!options?.exams.some(e=>String(e.id)===draft.examId)&&<option value={draft.examId}>Đề #{draft.examId} không còn khả dụng</option>}{options?.exams.map(e=><option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}</select></label>
          <label>Lớp (không bắt buộc)<select value={draft.classId} onChange={e=>update('classId',e.target.value)}><option value="">Không gắn lớp</option>{options?.classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Bắt đầu<DateTime24Field label="Bắt đầu" required value={draft.startTime} onChange={value=>update('startTime',value)}/></label>
          <label>Kết thúc<DateTime24Field label="Kết thúc" required min={draft.startTime||undefined} value={draft.endTime} onChange={value=>update('endTime',value)}/></label>
          <p className="admin-catalog-help full">Giờ Việt Nam (UTC+7). Chỉ sửa ca chưa bắt đầu và chưa có bài làm. Mã ca thi không được trùng ca khác.</p>
        </>}
      </div></fieldset></div>
      <footer><button className="admin-button secondary" type="button" disabled={busy} onClick={onClose}>Hủy</button><button className="admin-button primary" disabled={busy}>{busy?<Loader2 size={16} className="animate-spin"/>:<Save size={16}/>} {busy?'Đang lưu…':id===null?'Tạo mới':'Lưu thay đổi'}</button></footer>
    </form>}
  </Modal>;
}
