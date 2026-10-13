import { apiFetch } from '../../../services/api';

export interface AdminDashboard {
  totalUsers: number; activeUsers: number; students: number; teachers: number; admins: number;
  courses: number; exams: number; sessions: number; attempts: number; inProgressAttempts: number;
  completedAttempts: number; averageScore: number; recentCompletedAttempts: number; highRiskAttempts: number;
}
export interface AdminUser { id:number; username:string; email:string; fullName:string; role:string; department?:string; status:string; createdAt:string; }
export interface AdminCourse { id:number; code:string; name:string; department?:string; status:string; questionCount:number; examCount:number; sessionCount:number; }
export interface AdminExam { id:number; code:string; title:string; courseCode:string; courseName:string; durationMinutes:number; totalQuestions:number; totalPoints:number; status:string; examDate?:string; antiCheatMode:boolean; sessionCount:number; attemptCount:number; averageScore:number; }
export interface AdminSession { id:number; examId:number; examCode:string; examTitle:string; className:string; roomCode:string; accessCode?:string; startTime:string; endTime:string; status:string; registeredCount:number; attemptCount:number; }
export interface AdminAttempt { id:number; sessionId:number; studentUsername:string; studentName:string; examCode:string; examTitle:string; startedAt:string; submittedAt?:string; score?:number; totalPoints:number; status:string; browserEvents:number; aiEvents:number; }
export interface BrowserEvent { id:number; event:string; active:boolean; occurredAt:string; module:string; duration:number; riskScore:number; riskLevel:string; sourceModule?:string; evidencePath?:string; }
export interface AttemptDetail { attempt:AdminAttempt; events:BrowserEvent[]; }
export interface AntiCheatSummary { attemptId:number; totalEvents:number; tabHidden:number; fullscreenExit:number; windowBlur:number; copy:number; paste:number; rightClick:number; violationEvents:number; aiEvents:number; riskScore:number; riskLevel:string; }
export interface AuditRow { id:number; actorId?:number; actorUsername:string; action:string; targetType?:string; targetId?:string; detail?:string; createdAt:string; }

export interface AiRuntime { ok: boolean; ready: boolean; running: boolean; status: string; message: string; attemptId?: number | null; }
export const adminApi = {
  aiRuntime: () => apiFetch<AiRuntime>('/admin/ai-runtime'),
  aiPolicy: (id: number, enabled: boolean) => apiFetch(`/admin/exams/${id}/ai-policy?enabled=${enabled}`, { method: 'PATCH' }),
  dashboard: () => apiFetch<AdminDashboard>('/admin/dashboard'),
  users: (q='', role='', status='') => apiFetch<AdminUser[]>(`/admin/users?q=${encodeURIComponent(q)}&role=${encodeURIComponent(role)}&status=${encodeURIComponent(status)}`),
  students: (q='', status='') => apiFetch<AdminUser[]>(`/admin/students?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`),
  teachers: (q='', status='') => apiFetch<AdminUser[]>(`/admin/teachers?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`),
  courses: (q='') => apiFetch<AdminCourse[]>(`/admin/courses?q=${encodeURIComponent(q)}`),
  exams: (q='', status='') => apiFetch<AdminExam[]>(`/admin/exams?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`),
  sessions: (q='', status='') => apiFetch<AdminSession[]>(`/admin/sessions?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`),
  attempts: (q='', status='') => apiFetch<AdminAttempt[]>(`/admin/attempts?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`),
  attempt: (id:number) => apiFetch<AttemptDetail>(`/admin/attempts/${id}`),
  antiCheat: (id:number) => apiFetch<AntiCheatSummary>(`/admin/anti-cheating/${id}`),
  auditLogs: () => apiFetch<AuditRow[]>('/admin/audit-logs'),
  updateUserStatus: (id:number,status:string) => apiFetch<AdminUser>(`/admin/users/${id}/status?status=${encodeURIComponent(status)}`,{method:'PATCH'}),
};
