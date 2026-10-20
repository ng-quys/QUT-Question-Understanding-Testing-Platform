import { apiFetch } from '../../../services/api';
import type { AssignedGroup } from '../../sessions/services/assignedSittingService';
export interface TeacherProfile {id:number;name:string;email:string;department:string|null;role:string;username:string}
export interface TeacherOverview {courses:number;questions:number|null;bankUnavailable:boolean;exams:number;sessions:number;assignedGroups:number;upcoming:AssignedGroup[];recentExams:{id:number;title:string;code:string}[]}
export const getTeacherProfile=()=>apiFetch<TeacherProfile>('/teacher/profile');
export const getTeacherOverview=(signal?:AbortSignal)=>apiFetch<TeacherOverview>('/teacher/overview',{signal});
