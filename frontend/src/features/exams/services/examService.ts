import { apiFetch } from '@shared/services/api';

export interface ExamSummaryDto { id:number; code:string; title:string; courseId:number; courseCode:string; courseName:string; totalQuestions:number; status:string; examDate:string|null; shuffleQuestions:boolean; shuffleAnswers:boolean; antiCheatMode:boolean; }
export interface QuickExamRequest { courseId:number; title:string; code:string; totalQuestions:number; mediumPercent:number; goodPercent:number; excellentPercent:number; maxOverlapPercent:number; cloIds:number[]; shuffleQuestions:boolean; shuffleAnswers:boolean; antiCheatMode:boolean; }
export interface QuickExamResult { exam:ExamSummaryDto; mediumCount:number; goodCount:number; excellentCount:number; maximumAllowedOverlap:number; actualMaximumOverlap:number; questionIds:number[]; warnings:string[]; }
export const getExams = () => apiFetch<ExamSummaryDto[]>('/teacher/exams');
export const createQuickExam = (body:QuickExamRequest) => apiFetch<QuickExamResult>('/teacher/exams/quick',{method:'POST',body:JSON.stringify(body)});

export const setExamStatus=(id:number,value:string)=>apiFetch<ExamSummaryDto>(`/teacher/exams/${id}/status?value=${encodeURIComponent(value)}`,{method:'PATCH'});
export const deleteExam=(id:number)=>apiFetch<void>(`/teacher/exams/${id}`,{method:'DELETE'});

export type MatrixDimension = 'difficulty' | 'chapter' | 'topic' | 'clo';
export interface MatrixGroup { dimension: MatrixDimension; value: string; count: number }
export interface AutomaticExamRequest {
  courseId: number; title: string; code: string; variants: number; questions: number;
  overlapPercent: number; groups: MatrixGroup[];
  shuffleQuestions: boolean; shuffleAnswers: boolean; antiCheatMode: boolean;
}
export interface BankChoice { dimension: MatrixDimension; value: string; label: string; available: number }
export interface AutomaticBank { available: number; choices: BankChoice[] }
export const getAutomaticCourses = (signal?: AbortSignal) => apiFetch<{id:number;code:string;name:string}[]>('/teacher/exams/automatic/courses', {signal});
export interface MatrixCheck { dimension: MatrixDimension; value: string; label: string; required: number; available: number }
export interface AutomaticCheck { valid: boolean; available: number; maximumOverlap: number; groups: MatrixCheck[]; errors: string[]; warnings: string[] }
export interface AutomaticQuestion {
  id: number; content: string; explanation: string | null; difficulty: string; chapter: string; topic: string; clo: string;
  answers: { id: number; label: string; content: string; correct: boolean; position: number }[];
}
export interface AutomaticPreview {
  previewId: string; variants: { code: string; questions: AutomaticQuestion[] }[];
  pairs: { first: string; second: string; count: number; percent: number }[];
  totalOverlap: number; maximumOverlapPercent: number; elapsedMillis: number;
  status: 'OPTIMAL' | 'FEASIBLE'; provenOptimal: boolean; groups: MatrixCheck[]; warnings: string[];
}
export const getAutomaticBank = (courseId: number, signal?: AbortSignal) =>
  apiFetch<AutomaticBank>(`/teacher/exams/automatic/bank?courseId=${courseId}`, { signal });
export const checkAutomaticExam = (body: AutomaticExamRequest) =>
  apiFetch<AutomaticCheck>('/teacher/exams/automatic/check', { method: 'POST', body: JSON.stringify(body) });
export const previewAutomaticExam = (body: AutomaticExamRequest) =>
  apiFetch<AutomaticPreview>('/teacher/exams/automatic/preview', { method: 'POST', body: JSON.stringify(body) });
export const saveAutomaticExam = (previewId: string) =>
  apiFetch<{ examIds: number[] }>('/teacher/exams/automatic/save', { method: 'POST', body: JSON.stringify({ previewId }) });
