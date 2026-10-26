import { apiFetch } from '../../../services/api';
import type { InferenceBatchSize } from '../../../types';
export interface AiQuota {
  month: string; monthlyLimit: number; used: number; reserved: number;
  extraBalance: number; extraReserved: number; remaining: number; nextReset: string;
  maxPerRequest: number; activeJob: {id:number;status:string;requested:number} | null;
}
export interface AiGeneratedQuestion {
  evidenceQuote?:string;
  duplicateWarning?:{questionId:number|null;content:string;similarity:number;matchType:string;source:string;threshold:number};
  content:string;options:string[];correctIndex:number;explanation:string;
  bloom:'remember'|'understand'|'apply';chapterId:number|null;cloId:number|null;
}
export interface AiJob {
  selectedClos?:Array<{id:number;code:string;description:string}>;
  id:number;courseId:number;defaultScore?:number;status:string;requested:number;accepted:number;charged:number;
  error:string|null;questions:AiGeneratedQuestion[];
  batchSize:number;completedBatches:number;totalBatches:number;
  inferenceBatchSize:InferenceBatchSize;
}
export const aiTerminal = (status:string) => ['succeeded','partial','failed','cancelled'].includes(status);
export const quotaChanged = () => window.dispatchEvent(new Event('examflow-ai-quota'));
export const getAiQuota = () => apiFetch<AiQuota>('/teacher/ai-credits');
export const getAiReadiness = () => apiFetch<{ready:boolean;reason?:string}>('/teacher/ai-credits/readiness');
export const getAiJob = (id:number) => apiFetch<AiJob>('/teacher/ai-credits/jobs/'+id);
export interface AiDocumentRequest {
  courseId:number;provider:'qwen';sourceText?:string;sourceProof?:string;
  documentRefs?:Array<{documentId:string;revision:number;indexId:string;configHash:string}>;
  questionCount:number;cloIds:number[];defaultScore:number;
  batchSize:5|10;
  inferenceBatchSize:InferenceBatchSize;
}
export async function createAiJob(payload:AiDocumentRequest,key:string) {
  const readiness=await getAiReadiness();
  if(!readiness.ready)throw new Error(readiness.reason||'AI Generator chưa sẵn sàng. Vui lòng thử lại sau.');
  // Backend checks readiness again atomically before reservation; this GET is only UI feedback.
  const job=await apiFetch<AiJob>('/teacher/ai-credits/jobs?idempotencyKey='+encodeURIComponent(key),{method:'POST',body:JSON.stringify(payload)});
  quotaChanged();return job;
}
export async function cancelAiJob(id:number) {
  const job=await apiFetch<AiJob>('/teacher/ai-credits/jobs/'+id+'/cancel',{method:'POST'});
  quotaChanged();return job;
}
