// Synthetic browser fixture only. Never calls application API, Keycloak or Supabase.
import { createRoot } from 'react-dom/client';
import { CourseAllocation } from '../../frontend-admin/src/features/sessions/components/CourseAllocation';
import '../../frontend-shared/src/features/sessions/components/organization.css';

const roster=Array.from({length:100},(_,i)=>({id:i+1,username:String(9000000001+i),name:`Sinh viên kiểm thử ${String(i+1).padStart(3,'0')}`,classId:1,className:'DHTH01',department:'Công nghệ thông tin',status:'active'}));
const enrolled=new Set<number>();let allocated=false;
async function request<T=unknown>(url:string,init:RequestInit={}):Promise<T>{
 const path=new URL(url,'http://synthetic.invalid'),body=init.body?JSON.parse(String(init.body)):{};let result:unknown;
 if(path.pathname.endsWith('/options'))result={courses:[{id:1,code:'CSDL01',name:'Cơ sở dữ liệu'}],periods:[{id:1,code:'CK_2027',name:'Cuối kỳ 2027',status:'active'}]};
 else if(path.pathname==='/admin/organization/students'){const page=Number(path.searchParams.get('page')||0),search=path.searchParams.get('q')||'';const filtered=roster.filter(s=>`${s.username} ${s.name}`.includes(search));result={items:filtered.slice(page*20,page*20+20),total:filtered.length};}
 else if(path.pathname.endsWith('/courses/1/students')){if(init.method==='POST'){if(body.classId)roster.forEach(s=>enrolled.add(s.id));body.studentIds.forEach((id:number)=>enrolled.add(id));}if(init.method==='DELETE')body.studentIds.forEach((id:number)=>enrolled.delete(id));result={students:roster.filter(s=>enrolled.has(s.id))};}
 else if(path.pathname.endsWith('/candidates'))result={total:enrolled.size,assigned:allocated?enrolled.size:0,remaining:allocated?0:enrolled.size,students:allocated?[]:roster.filter(s=>enrolled.has(s.id))};
 else if(path.pathname.endsWith('/preview')){const list=roster.filter(s=>enrolled.has(s.id));const sessions=[];for(let n=0;n<list.length;n+=body.studentsPerSession){const start=new Date(`${body.startTime}+07:00`);start.setMinutes(start.getMinutes()+sessions.length*(body.durationMinutes+body.breakMinutes));sessions.push({number:sessions.length+1,name:`${body.name} · Ca ${sessions.length+1}`,startTime:start.toISOString(),endTime:new Date(start.getTime()+body.durationMinutes*60000).toISOString(),students:list.slice(n,n+body.studentsPerSession)});}result={total:list.length,assigned:0,remaining:list.length,previewToken:'synthetic',sessions};}
 else if(path.pathname.endsWith('/batches')){allocated=true;result={batchId:'synthetic'};}
 else throw Error(`Unsupported synthetic fixture: ${path.pathname}`);
 return result as T;
}
createRoot(document.getElementById('root')!).render(<main className="exam-org" style={{maxWidth:1280,margin:'24px auto',padding:16}}><p>Dữ liệu kiểm thử tổng hợp · Không ghi database thật</p><CourseAllocation rooms={[{id:1,code:'P101',name:'Phòng 101',status:'active',capacity:40}]} classes={[{id:1,code:'DHTH01',name:'DHTH01',status:'active'}]} exams={[{id:1,code:'CSDL-01',name:'Đề Cơ sở dữ liệu',courseId:1,durationMinutes:60}]} request={request} onCreated={()=>{}}/></main>);
