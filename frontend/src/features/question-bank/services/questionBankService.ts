import { apiFetch } from '../../../services/api';
import type { Bloom3Level, QuestionItem } from '../../../types';

type AnswerResponse = { id: number; label: string; content: string; correct: boolean; position: number };
type QuestionResponse = { id:number; courseId:number; chapterId:number|null; topicId:number|null; cloId:number|null; bloom:string; difficulty:string; content:string; explanation:string|null; status:'approved'|'pending'|'rejected'; source:'manual'|'ai'; defaultScore:number; createdAt:string|null; updatedAt:string|null; answers:AnswerResponse[] };
const normalizeBloom=(value:string):Bloom3Level=>{const v=value.toLowerCase();if(v.includes('remember')||v.includes('nhận'))return'remember';if(v.includes('apply')||v.includes('vận'))return'apply';return'understand';};
const mapQuestion=(q:QuestionResponse):QuestionItem=>{const answers=[...q.answers].sort((a,b)=>a.position-b.position);return{id:String(q.id),courseId:String(q.courseId),chapterId:q.chapterId?String(q.chapterId):'',topicId:q.topicId?String(q.topicId):'',cloId:q.cloId?String(q.cloId):'',bloom:normalizeBloom(q.bloom),content:q.content,options:answers.map(a=>a.content),correctIndex:Math.max(0,answers.findIndex(a=>a.correct)),explanation:q.explanation??'',status:q.status,source:q.source,createdAt:q.createdAt,updatedAt:q.updatedAt??'',default_score:Number(q.defaultScore??1)};};
const payload=(q:QuestionItem)=>({courseId:Number(q.courseId),chapterId:q.chapterId?Number(q.chapterId):null,topicId:q.topicId?Number(q.topicId):null,cloId:q.cloId?Number(q.cloId):null,bloom:q.bloom,difficulty:'medium',content:q.content,explanation:q.explanation??'',status:q.status,defaultScore:q.default_score??1,answers:q.options.map((content,index)=>({content,correct:index===q.correctIndex}))});
export async function getQuestions(){return(await apiFetch<QuestionResponse[]>('/teacher/questions')).map(mapQuestion);}
export async function createQuestion(q:QuestionItem){return mapQuestion(await apiFetch<QuestionResponse>('/teacher/questions',{method:'POST',body:JSON.stringify(payload(q))}));}
export async function updateQuestion(q:QuestionItem){return mapQuestion(await apiFetch<QuestionResponse>(`/teacher/questions/${q.id}`,{method:'PUT',body:JSON.stringify(payload(q))}));}
export async function setQuestionStatus(id:string,status:'approved'|'pending'|'rejected'){return mapQuestion(await apiFetch<QuestionResponse>(`/teacher/questions/${id}/status`,{method:'PATCH',body:JSON.stringify({status})}));}
export async function deleteQuestion(id:string){await apiFetch<void>(`/teacher/questions/${id}`,{method:'DELETE'});}
