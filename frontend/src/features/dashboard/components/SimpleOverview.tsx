import {useEffect,useState} from 'react';
import {getTeacherOverview,type TeacherOverview} from '../services/overviewService';
import type {DashboardNavTab} from '../../../types';
export function SimpleOverview({onNavigateTab}:{onNavigateTab:(tab:DashboardNavTab)=>void}){
 const [data,setData]=useState<TeacherOverview|null>(null);const [error,setError]=useState('');
 useEffect(()=>{let active=true;getTeacherOverview().then(v=>{if(active)setData(v)}).catch(()=>{if(active)setError('Không tải được dữ liệu. Kiểm tra kết nối backend và thử lại.')});return()=>{active=false}},[]);
 const items:[string,number,DashboardNavTab][] = data?[['Học phần',data.courses,'courses'],['Câu hỏi',data.questions,'question-bank'],['Đề thi',data.exams,'exams'],['Ca thi',data.sessions,'exam-sessions']]:[];
 return <section className="mx-auto max-w-5xl space-y-7 py-3">
  <div><h2 className="text-2xl font-semibold tracking-tight text-slate-900">Quản lý kỳ thi dễ dàng hơn với ExamFlow</h2><p className="mt-1 text-sm text-slate-500">Hoạt động giảng dạy và khảo thí của bạn</p></div>
  <div className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="mb-3 text-sm font-semibold text-slate-900">Lối tắt nhanh</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{([['Tạo câu hỏi','new-question'],['Ngân hàng câu hỏi','question-bank'],['Tạo đề nhanh','quick-exam'],['Quản lý đề thi','exams'],['Ca thi trực tuyến','exam-sessions']] as [string,DashboardNavTab][]).map(([label,tab])=><button key={tab} onClick={()=>onNavigateTab(tab)} className="rounded-lg border border-slate-200 px-4 py-3 text-left text-sm font-medium text-blue-900 hover:bg-blue-50">{label} →</button>)}</div></div>
  {error?<div role="alert" className="rounded-xl border border-rose-200 p-5 text-sm text-rose-700">{error}</div>:!data?<p className="text-sm text-slate-500">Đang tải dữ liệu...</p>:<>
   <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{items.map(([name,value,tab])=><button key={name} onClick={()=>onNavigateTab(tab)} className="rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:border-blue-300 hover:shadow-sm"><p className="text-sm text-slate-500">{name}</p><p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p></button>)}</div>
   <div className="rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h3 className="font-semibold text-slate-900">Đề thi gần đây</h3><button onClick={()=>onNavigateTab('exams')} className="text-sm font-medium text-blue-700 hover:underline">Xem tất cả</button></div>
   {data.recentExams.length===0?<p className="px-5 py-9 text-center text-sm text-slate-500">Chưa có đề thi nào. Hãy tạo đề thi từ mục Quản lý đề thi.</p>:<div className="divide-y divide-slate-100">{data.recentExams.map(e=><button key={e.id} onClick={()=>onNavigateTab('exams')} className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50"><span className="font-medium text-sm text-slate-800">{e.title}</span><span className="ml-3 text-xs text-slate-500">{e.code}</span></button>)}</div>}</div>
  </>}
 </section>
}
