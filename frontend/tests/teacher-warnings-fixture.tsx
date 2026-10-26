// Synthetic API: no credentials, backend requests or database writes.
import { createRoot } from 'react-dom/client';
import { TeacherWarningsPage } from '../src/features/sessions/pages/TeacherWarningsPage';
import { evidenceApi } from '../../frontend-shared/src/features/evidence/services/evidenceApi';
import type { apiFetch } from '../../frontend-shared/src/services/api';
import '../src/layouts/lecturer/lecturer.css';
const row={id:41,name:'Ca thi PHP · Nhóm 1',roomCode:'P002',roomName:'A101',examCode:'PHP-01',examTitle:'Lập trình mã nguồn mở',courseCode:'IT07',startTime:'2026-10-22T13:40:00+07:00',endTime:'2026-10-22T23:59:00+07:00',status:'ongoing',warnedAttempts:2,browserEvents:5,aiEvents:3};
const request:typeof apiFetch=async<T,>(path:string):Promise<T>=>{
  const url=new URL(path,'http://fixture.invalid');
  if(url.pathname.endsWith('/warning-sessions')){
    const items=(!url.searchParams.get('q')||row.name.toLowerCase().includes(url.searchParams.get('q')!.toLowerCase()))?[row]:[];
    return {items,total:items.length,serverTime:new Date().toISOString()} as T;
  }
  if(url.pathname.endsWith('/warning-sessions/41'))return {session:row,roster:[
    {id:1,username:'9000000001',name:'Sinh viên mẫu A',className:'DHTH01',department:'Công nghệ thông tin',attemptId:122,attemptStatus:'in_progress',startedAt:row.startTime,warningCount:5,riskLevel:'HIGH'},
    {id:2,username:'9000000002',name:'Sinh viên mẫu B',className:'DHTH01',department:'Công nghệ thông tin',attemptId:123,attemptStatus:'completed',startedAt:row.startTime,submittedAt:'2026-10-22T14:20:00+07:00',warningCount:3,riskLevel:'LOW'},
    {id:3,username:'9000000003',name:'Sinh viên không có cảnh báo',warningCount:0},
  ]} as T;
  throw new Error('Bạn không được phân công phụ trách dữ liệu này');
};
const evidence:typeof evidenceApi={...evidenceApi,events:async()=>({items:Array.from({length:new URLSearchParams(location.search).has('long')?20:1},(_,index)=>({id:index+1,event:'WINDOW_BLUR',active:true,occurredAt:'2026-10-22T14:00:00+07:00',module:'M7',duration:0,riskScore:20,riskLevel:'LOW',provider:'supabase',evidenceStatus:'uploaded',hasEvidence:true})),total:new URLSearchParams(location.search).has('long')?20:1,page:0,size:20,attemptStatus:'completed'}),link:async()=>({provider:'supabase',url:'/tests/evidence.svg',expiresAt:new Date(Date.now()+180000).toISOString()})};
createRoot(document.getElementById('root')!).render(<div className="lecturer-workspace"><main className="lecturer-main" style={{margin:'0 auto'}}><p style={{fontSize:11,color:'#7b8da5'}}>Kiểm thử giao diện giảng viên · Dữ liệu giả</p><TeacherWarningsPage request={request} evidence={evidence}/></main></div>);
