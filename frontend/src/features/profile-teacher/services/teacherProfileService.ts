import { apiFetch } from '../../../services/api';
export interface TeacherProfile {id:number;name:string;email:string;department:string|null;role:string;username:string}
const profileListeners = new Set<(profile: TeacherProfile) => void>();

export function subscribeTeacherProfile(listener: (profile: TeacherProfile) => void) {
  profileListeners.add(listener);
  return () => { profileListeners.delete(listener); };
}

export const getTeacherProfile=()=>apiFetch<TeacherProfile>('/teacher/profile');
export async function updateTeacherProfile(body: {name:string;department:string}) {
  const profile = await apiFetch<TeacherProfile>('/teacher/profile', {
    method: 'PATCH', body: JSON.stringify(body),
  });
  profileListeners.forEach(listener => listener(profile));
  return profile;
}
