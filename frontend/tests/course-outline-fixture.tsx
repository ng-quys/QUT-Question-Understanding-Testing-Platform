// Synthetic UI fixture. Browser tests intercept every API; no real account or database.
import {createRoot} from 'react-dom/client';
import {StrictMode,useState,useCallback} from 'react';
import {CourseListPage} from '../src/features/courses/pages/CourseListPage';
import {CourseContentStructureTab} from '../src/features/courses/components/CourseContentStructureTab';
import type {Course} from '@shared/types';
import '../src/index.css';
function Fixture() {
 const [courses,setCourses]=useState<Course[]>([]);
 const toast=useCallback(()=>{},[]);
 return <main className="mx-auto max-w-6xl p-4 sm:p-6" style={{'--primary':'#172b4d'} as React.CSSProperties}>
  <h1 className="mb-4 text-xl font-semibold">ExamFlow · Không gian giảng viên (fixture)</h1>
  <CourseListPage courses={courses} chapters={[]} clos={[]} onUpdateCourses={setCourses} onUpdateChapters={()=>{}} onUpdateCLOs={()=>{}} onShowToast={toast}/>
 </main>;
}
function StructureFixture(){
 const [filter,setFilter]=useState('');
 const codes=['2.1','2.1.1','2.1.2','2.2','2.2.1','2.1.1.1'];
 return <main className="mx-auto max-w-6xl p-6"><CourseContentStructureTab courseId="11" chapters={[{
  id:'22',courseId:'11',code:'Chương 2',name:'Hệ thống',order:2,
  topics:codes.map((code,i)=>({id:'topic-'+i,chapterId:'22',code,name:'Tên '+code,questionCount:7+i})),
 }]} onUpdateChapters={()=>{}} onShowToast={()=>{}} onFilterByTopic={setFilter}/><output data-testid="filtered-topic">{filter}</output></main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode>{new URLSearchParams(location.search).has('structure')?<StructureFixture/>:<Fixture/>}</StrictMode>);
