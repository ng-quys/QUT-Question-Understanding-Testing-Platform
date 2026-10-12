import { apiFetch } from '../../../services/api';
export interface TeacherProfile {id:number;name:string;email:string;department:string|null;role:string;username:string}
export const getTeacherProfile=()=>apiFetch<TeacherProfile>('/teacher/profile');
export const updateTeacherProfile=(body:{name:string;department:string})=>apiFetch<TeacherProfile>('/teacher/profile',{method:'PATCH',body:JSON.stringify(body)});
