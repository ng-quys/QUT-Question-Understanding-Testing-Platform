import type {QuestionItem,Course,CourseChapter,CourseCLO,SourceDocument,Bloom3Level} from '../../../types';
interface Props {
 questions:QuestionItem[];documents:SourceDocument[];courses:Course[];chapters:CourseChapter[];clos:CourseCLO[];saving?:boolean;
 onUpdateQuestion:(id:string,updates:Partial<QuestionItem>)=>void;onDeleteQuestion:(id:string)=>void;
 onSaveAll:(status:'pending'|'approved')=>void;onGenerateMore:()=>void;onNewDocuments:()=>void;
}
export function QuestionReviewStep({questions,clos,saving,onUpdateQuestion,onDeleteQuestion,onSaveAll,onGenerateMore,onNewDocuments}:Props){
 return <div className="space-y-4"><h2 className="text-lg font-semibold">Xem xét và hiệu chỉnh câu hỏi</h2>
   {questions.map((q,index)=><fieldset disabled={saving} key={q.id} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
     <legend className="text-sm font-semibold">Câu {index+1}</legend>
     <div className="flex gap-3"><label className="text-sm">CLO<select aria-label={`CLO câu ${index+1}`} value={q.cloId} onChange={e=>onUpdateQuestion(q.id,{cloId:e.target.value})} className="border border-slate-200 rounded p-2 ml-2">
       <option value={q.cloId}>{clos.find(c=>String(c.id)===q.cloId)?.code||`CLO #${q.cloId}`}</option>
       {clos.filter(c=>String(c.courseId)===q.courseId&&String(c.id)!==q.cloId&&c.status==='active').map(c=><option key={c.id} value={c.id}>{c.code}</option>)}</select></label>
       <label className="text-sm">Bloom<select aria-label={`Bloom câu ${index+1}`} value={q.bloom} onChange={e=>onUpdateQuestion(q.id,{bloom:e.target.value as Bloom3Level})} className="border border-slate-200 rounded p-2 ml-2"><option value="remember">Nhận biết</option><option value="understand">Thông hiểu</option><option value="apply">Vận dụng</option></select></label></div>
     <label className="block text-sm">Nội dung<textarea value={q.content} onChange={e=>onUpdateQuestion(q.id,{content:e.target.value})} rows={3} className="block w-full border border-slate-200 rounded-lg p-2 mt-1"/></label>
     {q.options.map((option,i)=><label key={i} className="flex gap-3 items-center text-sm"><input type="radio" name={`correct-${q.id}`} aria-label={`Đáp án đúng ${i+1}`} checked={q.correctIndex===i} onChange={()=>onUpdateQuestion(q.id,{correctIndex:i})}/><input aria-label={`Phương án ${i+1} câu ${index+1}`} value={option} onChange={e=>onUpdateQuestion(q.id,{options:q.options.map((o,j)=>j===i?e.target.value:o)})} className="border border-slate-200 rounded-lg p-2 flex-1"/></label>)}
     <label className="block text-sm">Giải thích<textarea value={q.explanation||''} onChange={e=>onUpdateQuestion(q.id,{explanation:e.target.value})} className="block w-full border border-slate-200 rounded-lg p-2 mt-1"/></label>
     {q.evidenceQuote&&<blockquote className="text-sm text-slate-600 border-l-2 border-slate-300 pl-3">Căn cứ từ tài liệu: {q.evidenceQuote}</blockquote>}
     <button onClick={()=>onDeleteQuestion(q.id)} className="text-sm text-red-700 underline">Loại bỏ câu này</button>
   </fieldset>)}
   <div className="flex flex-wrap gap-4 text-sm"><button disabled={saving||!questions.length} onClick={()=>onSaveAll('pending')} className="border border-slate-200 rounded-lg px-4 py-2">Lưu chờ duyệt</button><button disabled={saving||!questions.length} onClick={()=>onSaveAll('approved')} className="bg-[#172b4d] text-white rounded-lg px-4 py-2">{saving?'Đang lưu…':'Duyệt và lưu ngân hàng'}</button><button disabled={saving} onClick={onGenerateMore} className="underline">Sinh lượt tiếp theo</button><button disabled={saving} onClick={onNewDocuments} className="underline">Tài liệu mới</button></div>
 </div>;
}
