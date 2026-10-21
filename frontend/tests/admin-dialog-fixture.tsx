import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DepartmentExamPanel } from '../src/features/sessions/components/DepartmentExamPanel';
import { Modal } from '../src/features/admin/components/AdminUI';
import '../src/index.css';
import '../src/features/admin/styles/admin.css';
import '../src/features/sessions/components/organization.css';

const group={id:1,number:1,roomId:1,roomCode:'P03',roomName:'A102',teacherId:1,teacherName:'Giảng viên kiểm thử',examId:1,examTitle:'Đề mẫu kiểm thử',status:'scheduled',publishedAt:'2026-10-22T00:00:00+07:00',studentCount:9,students:[],missing:[],ready:true};
const base={id:12,code:'CT-12',name:'CA THI KIỂM THỬ',courseId:1,department:'Công nghệ thông tin',courseCode:'MH01',courseName:'Môn kiểm thử',periodName:'Học kỳ 1',startTime:'2026-10-22T00:50:00+07:00',endTime:'2026-10-22T05:00:00+07:00',groups:[group],groupCount:1,studentCount:9,publishedGroups:1,groupsWithExam:1,status:'published',canEditSchedule:false,scheduleLockReason:'Ca đã có bài làm, không được thay đổi lịch thi.'};
const rows=[{...base,status:'ongoing',name:'Ca đang diễn ra'},
  {...base,id:13,code:'CT-13',name:'Ca đã kết thúc',status:'completed'},
  {...base,id:14,code:'CT-14',name:'Ca đã hủy',publishedGroups:0,status:'cancelled'},
  {...base,id:15,code:'CT-15',name:'Ca đã công bố',status:'published'},
  {...base,id:16,code:'CT-16',name:'Ca chưa công bố',publishedGroups:0,status:'ready',groups:[{...group,publishedAt:undefined}]},
  {...base,id:17,code:'CT-17',name:'Ca công bố một phần',groupCount:2,publishedGroups:1,status:'partial'},
  {...base,id:18,code:'CT-18',name:'CA THI ĐANG CHUẨN BỊ',publishedGroups:0,groupsWithExam:0,status:'assignment',canEditSchedule:true,scheduleLockReason:undefined,groups:[{...group,roomId:undefined,roomCode:undefined,roomName:undefined,teacherId:undefined,teacherName:undefined,examId:undefined,examTitle:undefined,publishedAt:undefined,ready:false,missing:['phòng','giảng viên','đề thi']}]}];
async function request<T,>(path:string):Promise<T>{
  if(path.endsWith('/options'))return {courses:[],periods:[],departments:[]} as T;
  if(path.includes('?'))return {total:rows.length,items:rows} as T;
  const row=rows.find(item=>path.endsWith('/'+item.id));
  if(row)return row as T;
  throw new Error('Fixture only supports read requests');
}
function Fixture(){
  const [modal,setModal]=useState<'small'|'wide'|null>(null);
  const [collapsed,setCollapsed]=useState(false);
  return <div className={`admin-workspace${collapsed?' sidebar-collapsed':''}`} style={{display:'block',minHeight:'100vh',background:'#f4f7fb'}}>
    <aside className="admin-sidebar"><div className="admin-sidebar-heading"><strong>ExamFlow</strong><button className="admin-sidebar-toggle" onClick={()=>setCollapsed(value=>!value)}>↔</button></div><nav><button>Tổng quan</button><button>Phòng thi & lớp</button><button className="active">Danh sách ca thi</button></nav></aside>
    <main className="admin-content" style={{padding:32}}>
    <header className="admin-page-heading"><div><h1>Danh sách ca thi</h1><p>Giao diện kiểm thử bằng dữ liệu mô phỏng.</p></div><div style={{display:'flex',gap:10}}><button className="admin-button" onClick={()=>setModal('small')}>Mở biểu mẫu ngắn</button><button className="admin-button" onClick={()=>setModal('wide')}>Mở nội dung dài</button></div></header>
    <DepartmentExamPanel rooms={[]} exams={[]} request={request} onCreated={()=>{}} view="list" hideHeading initialSittingId={Number(new URLSearchParams(location.search).get('sitting'))||undefined}/>
    {modal&&<Modal title={modal==='small'?'Thông tin tài khoản':'Chi tiết lượt thi'} wide={modal==='wide'} onClose={()=>setModal(null)}>
      <div className="admin-modal-body">{modal==='small'?<label className="admin-form-grid">Họ và tên<input placeholder="Nhập họ và tên"/></label>:Array.from({length:18},(_,i)=><p key={i} style={{padding:18,borderBottom:'1px solid #e1e8f1'}}>Nội dung kiểm thử {i+1} — phần nội dung dài cuộn bên trong cửa sổ.</p>)}</div>
      <footer><button className="admin-button" onClick={()=>setModal(null)}>Đóng cửa sổ</button></footer>
    </Modal>}
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

