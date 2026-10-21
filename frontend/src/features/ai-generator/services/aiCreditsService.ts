import { apiFetch } from '../../../services/api';
export interface AiQuota {
  month: string; monthlyLimit: number; used: number; reserved: number;
  extraBalance: number; extraReserved: number; remaining: number; nextReset: string;
  maxPerRequest: number; activeJob: {id:number;status:string;requested:number} | null;
}
export interface AiGeneratedQuestion {
  evidenceQuote?:string;
  content:string;options:string[];correctIndex:number;explanation:string;
  bloom:'remember'|'understand'|'apply';chapterId:number|null;cloId:number|null;
}
export interface AiJob {
  selectedClos?:Array<{id:number;code:string;description:string}>;
  id:number;courseId:number;defaultScore?:number;status:string;requested:number;accepted:number;charged:number;
  error:string|null;questions:AiGeneratedQuestion[];
}
export const aiTerminal = (status:string) => ['succeeded','partial','failed','cancelled'].includes(status);
export const quotaChanged = () => window.dispatchEvent(new Event('examflow-ai-quota'));
export const getAiQuota = () => apiFetch<AiQuota>('/teacher/ai-credits');
export const getAiJob = (id:number) => apiFetch<AiJob>('/teacher/ai-credits/jobs/'+id);
export interface AiDocumentRequest {
  courseId:number;provider:'qwen';sourceText:string;sourceProof?:string;
  questionCount:number;cloIds:number[];defaultScore:number;
}
export async function createAiJob(payload:AiDocumentRequest,key:string) {
  const job=await apiFetch<AiJob>('/teacher/ai-credits/jobs?idempotencyKey='+encodeURIComponent(key),{method:'POST',body:JSON.stringify(payload)});
  quotaChanged();return job;
}
export async function cancelAiJob(id:number) {
  const job=await apiFetch<AiJob>('/teacher/ai-credits/jobs/'+id+'/cancel',{method:'POST'});
  quotaChanged();return job;
}
