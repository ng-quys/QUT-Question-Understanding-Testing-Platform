import { apiFetch } from '@shared/services/api';
export function loadStudentPhoto():Promise<Blob>{return apiFetch<Blob>('/student/profile/photo',{cache:'no-store'});}
