import { apiFetch } from '../../../services/api';

export interface ExamSummaryDto { id:number; code:string; title:string; courseId:number; courseCode:string; courseName:string; durationMinutes:number; totalQuestions:number; status:string; examDate:string|null; shuffleQuestions:boolean; shuffleAnswers:boolean; antiCheatMode:boolean; }
export interface QuickExamRequest { courseId:number; title:string; code:string; durationMinutes:number; totalQuestions:number; mediumPercent:number; goodPercent:number; excellentPercent:number; maxOverlapPercent:number; cloIds:number[]; shuffleQuestions:boolean; shuffleAnswers:boolean; antiCheatMode:boolean; }
export interface QuickExamResult { exam:ExamSummaryDto; mediumCount:number; goodCount:number; excellentCount:number; maximumAllowedOverlap:number; actualMaximumOverlap:number; questionIds:number[]; warnings:string[]; }
export const getExams = () => apiFetch<ExamSummaryDto[]>('/teacher/exams');
export const createQuickExam = (body:QuickExamRequest) => apiFetch<QuickExamResult>('/teacher/exams/quick',{method:'POST',body:JSON.stringify(body)});

export const setExamStatus=(id:number,value:string)=>apiFetch<ExamSummaryDto>(`/teacher/exams/${id}/status?value=${encodeURIComponent(value)}`,{method:'PATCH'});
export const deleteExam=(id:number)=>apiFetch<void>(`/teacher/exams/${id}`,{method:'DELETE'});
