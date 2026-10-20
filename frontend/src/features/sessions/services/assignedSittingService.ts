import { apiFetch } from '../../../services/api';
export interface AssignedGroup {
  id:number;sittingId:number;number:number;name:string;courseId:number;courseCode:string;courseName:string;
  roomCode:string|null;roomName:string|null;startTime:string;endTime:string;studentCount:number;
  examId:number|null;examCode:string|null;examTitle:string|null;published:boolean;
  status:'scheduled'|'ongoing'|'completed'|'cancelled';canChangeExam:boolean;lockReason:string;
  sessionId:number|null;attempts:number;
}
export interface AssignedExamChoice {id:number;code:string;title:string;questions:number;totalPoints:number}
export interface AssignedExamPreview {
  id:number;code:string;title:string;courseName:string;totalPoints:number;revisionToken:string;
  questions:{id:number;position:number;content:string;points:number;answers:{label:string;content:string;correct:boolean}[]}[];
}
const base='/teacher/assigned-sittings';
export const assignedSittingApi={
  list:(signal?:AbortSignal)=>apiFetch<AssignedGroup[]>(base,{signal}),
  choices:(id:number,search:string,signal?:AbortSignal)=>apiFetch<{group:AssignedGroup;exams:AssignedExamChoice[]}>(`${base}/groups/${id}/exams?search=${encodeURIComponent(search)}`,{signal}),
  preview:(id:number,examId:number,signal?:AbortSignal)=>apiFetch<AssignedExamPreview>(`${base}/groups/${id}/exams/${examId}`,{signal}),
  select:(group:AssignedGroup,exam:AssignedExamPreview)=>apiFetch<AssignedGroup>(`${base}/groups/${group.id}/exam`,{method:'PUT',body:JSON.stringify({examId:exam.id,expectedExamId:group.examId,expectedToken:exam.revisionToken})}),
};
