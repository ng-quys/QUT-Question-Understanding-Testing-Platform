import { apiFetch } from '../../../services/api';
import type { AssignedExamPreview } from '../../sessions/services/assignedSittingService';
export interface LibraryExam {id:number;code:string;title:string;courseId:number;courseCode:string;courseName:string;totalQuestions:number;totalPoints:number;status:string;canEdit:boolean;canDelete:boolean}
export interface LibraryDetail extends AssignedExamPreview {courseId:number;courseCode:string;status:string;canEdit:boolean;canDelete:boolean;matrixAvailable:boolean;overlapAvailable:boolean;shuffleQuestions:boolean;shuffleAnswers:boolean;antiCheatMode:boolean}
export interface LibraryEdit {title:string;expectedToken:string;shuffleQuestions:boolean;shuffleAnswers:boolean;antiCheatMode:boolean}
const base='/teacher/exam-library';
export const examLibraryApi={list:(signal?:AbortSignal)=>apiFetch<LibraryExam[]>(base,{signal}),detail:(id:number,signal?:AbortSignal)=>apiFetch<LibraryDetail>(`${base}/${id}`,{signal}),edit:(id:number,body:LibraryEdit)=>apiFetch<LibraryDetail>(`${base}/${id}`,{method:'PUT',body:JSON.stringify(body)}),delete:(id:number)=>apiFetch<void>(`${base}/${id}`,{method:'DELETE'})};
