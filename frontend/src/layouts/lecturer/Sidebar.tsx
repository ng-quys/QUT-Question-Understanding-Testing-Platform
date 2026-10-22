import { useEffect, type ElementType } from 'react';
import { Activity, BookOpen, CalendarClock, ChevronLeft, ChevronRight, Database, FileSpreadsheet, GraduationCap, LayoutDashboard, LogOut, PlusCircle, Settings, WandSparkles, X } from 'lucide-react';
import { useAiQuota } from '../../features/ai-generator/hooks/useAiQuota';
import type { DashboardNavTab } from '@shared/types';
interface SidebarProps { activeTab:DashboardNavTab;onTabChange:(tab:DashboardNavTab)=>void;onLogout:()=>void;isMobileOpen?:boolean;onMobileClose?:()=>void;onOpenAIGenerator:()=>void;isCollapsed?:boolean;onToggleCollapse?:()=>void }
const groups:{label:string;items:{id:DashboardNavTab;label:string;icon:ElementType}[]}[]=[
 {label:'Không gian làm việc',items:[{id:'overview',label:'Tổng quan',icon:LayoutDashboard},{id:'courses',label:'Học phần phụ trách',icon:BookOpen}]},
 {label:'Ngân hàng câu hỏi',items:[{id:'question-bank',label:'Danh sách câu hỏi',icon:Database},{id:'new-question',label:'Thêm câu hỏi',icon:PlusCircle}]},
 {label:'Khảo thí',items:[{id:'quick-exam',label:'Tạo đề tự động',icon:WandSparkles},{id:'exams',label:'Quản lý đề thi',icon:FileSpreadsheet},{id:'exam-sessions',label:'Ca thi được phân công',icon:CalendarClock},{id:'monitoring',label:'Giám sát ca thi',icon:Activity}]},
 {label:'Tài khoản',items:[{id:'settings',label:'Cài đặt',icon:Settings}]},
];
export function Sidebar({activeTab,onTabChange,onLogout,isMobileOpen=false,onMobileClose,isCollapsed=false,onToggleCollapse}:SidebarProps){
 const {quota,error}=useAiQuota();
 const totalCredits=quota?Math.max(0,quota.monthlyLimit+quota.extraBalance):0;
 const remainingPercent=quota&&totalCredits>0?Math.min(100,Math.max(0,quota.remaining/totalCredits*100)):0;
 const collapsed=isCollapsed&&!isMobileOpen;
 const go=(id:DashboardNavTab)=>{onTabChange(id);onMobileClose?.();};
 useEffect(()=>{if(!isMobileOpen)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape')onMobileClose?.();};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[isMobileOpen,onMobileClose]);
 return <>{isMobileOpen&&<button className="t-backdrop" aria-label="Đóng menu điều hướng" onClick={onMobileClose}/>}<aside className={`t-sidebar ${collapsed?'collapsed':''} ${isMobileOpen?'mobile-open':''}`}>
  <button className="t-brand" onClick={()=>go('overview')} aria-label="ExamFlow · Tổng quan"><span><GraduationCap size={21}/></span><div><b>ExamFlow</b><small>Không gian giảng viên</small></div></button>
  <button className="t-collapse" onClick={onToggleCollapse} aria-label={collapsed?'Mở rộng menu':'Thu gọn menu'}>{collapsed?<ChevronRight size={15}/>:<ChevronLeft size={15}/>}</button>
  {isMobileOpen&&<button className="t-mobile-close" onClick={onMobileClose} aria-label="Đóng menu"><X size={20}/></button>}
  <nav aria-label="Điều hướng giảng viên">{groups.map(group=><section key={group.label}><span className="t-nav-label">{group.label}</span>{group.items.map(({id,label,icon:Icon})=><button key={id} title={label} className={activeTab===id?'active':''} aria-current={activeTab===id?'page':undefined} onClick={()=>go(id)}><Icon size={18}/><span>{label}</span></button>)}</section>)}</nav>
  <div className="t-sidebar-bottom"><div className="t-quota"><span>Giới hạn sử dụng</span><div className="t-quota-progress" role="progressbar" aria-label="Credits còn lại" aria-valuemin={0} aria-valuemax={100} aria-valuenow={quota?remainingPercent:undefined}><div style={{width:`${remainingPercent}%`}}/></div><strong>{quota?`Còn ${quota.remaining} credits`:error?'Chưa kết nối':'Đang tải…'}</strong></div><button title="Đăng xuất" onClick={onLogout}><LogOut size={18}/>{!collapsed&&<span>Đăng xuất</span>}</button></div>
 </aside></>;
}
