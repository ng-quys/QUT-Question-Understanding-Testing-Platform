import { useState } from 'react';
import type { AssignedExamPreview } from '../../sessions/services/assignedSittingService';
export function SavedExamPaper({exam}:{exam:AssignedExamPreview}){
 const [answers,setAnswers]=useState(false);
 return <section className="t-paper"><div className="t-actions justify-between"><span className="t-badge">{exam.questions.length} câu · {exam.totalPoints} điểm</span><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={answers} onChange={event=>setAnswers(event.target.checked)}/>Hiện đáp án đúng</label></div><h3 className="mt-5">{exam.title}</h3><p className="text-center text-slate-500">Mã đề {exam.code} · {exam.courseName}</p><ol>{exam.questions.map((question,index)=><li key={`${question.id}:${question.position}`}><p><b>Câu {index+1}.</b> {question.content} <span className="text-xs text-slate-500">({question.points} điểm)</span></p><ul>{question.answers.map(answer=><li key={answer.label} className={answers&&answer.correct?'correct':''}><b>{answer.label}.</b> {answer.content}{answers&&answer.correct?' ✓':''}</li>)}</ul></li>)}</ol></section>;
}
