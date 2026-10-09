import { apiFetch } from '../../../services/api';
export interface TeacherProfile {id:number;name:string;email:string;department:string|null;role:string;username:string}
export interface TeacherOverview {courses:number;questions:number;exams:number;sessions:number;recentExams:{id:number;title:string;code:string}[]}
export const getTeacherProfile=()=>apiFetch<TeacherProfile>('/teacher/profile');
export const getTeacherOverview=()=>apiFetch<TeacherOverview>('/teacher/overview');
