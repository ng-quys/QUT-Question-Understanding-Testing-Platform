// Dev-only test harness. All HTTP APIs must be intercepted by test-ai-generator.mjs.
import {createRoot} from 'react-dom/client';
import {AIGeneratorPage} from '../src/features/ai-generator/pages/AIGeneratorPage';
import type {Course,CourseCLO} from '../../frontend-shared/src/types';
import '../../frontend-shared/src/styles/base.css';
const courses:Course[]=[{id:'1',code:'TEST',name:'Học phần kiểm thử',credits:3,department:'',chaptersCount:0,cloCount:2,questionCount:0,status:'active',updatedAt:''}];
const clos:CourseCLO[]=[1,2].map(id=>({id:String(id),courseId:'1',code:`CLO${id}`,description:`Chuẩn đầu ra kiểm thử ${id}`,defaultBloom:'remember',status:'active'}));
createRoot(document.getElementById('root')!).render(<main className="p-6 max-w-5xl mx-auto"><AIGeneratorPage courses={courses} chapters={[]} clos={clos}
 onSaveQuestions={()=>{}} onNavigateToQuestionBank={()=>{document.body.dataset.saved='true';}} onShowToast={()=>{}}/></main>);
