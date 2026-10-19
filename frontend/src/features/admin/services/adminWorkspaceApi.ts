import { apiFetch } from '../../../services/api';
import { adminApi, type AdminUser } from './adminService';
import { evidenceApi } from '../../evidence/services/evidenceApi';

export type AdminTab = 'studentClasses' | 'sessionList' | 'liveSessions' | 'organization' | 'overview' | 'users' | 'students' | 'teachers' | 'courses' | 'exams' | 'sessions' | 'attempts' | 'anti' | 'reports' | 'audit' | 'accounts' | 'monitor';
export type DataRow = Record<string, string | number | boolean | null>;
export interface Page<T = DataRow> { items: T[]; total: number; page: number; size: number }
export interface Filters { q: string; status: string; role: string; course: string; sessionCode: string; from: string; to: string }
export const emptyFilters: Filters = { q: '', status: '', role: '', course: '', sessionCode: '', from: '', to: '' };
export interface Review { outcome: 'unreviewed' | 'needs_review' | 'cleared' | 'flagged'; note: string; revision: number; updatedAt?: string; reviewerName?: string }
export interface Report { graded?:number; ungraded?:number; completed: number; averagePercent: number; atLeastHalf: number; latestSubmission: string | null; distribution: { bucket: number; count: number }[]; courses: { code: string; name: string; count: number; graded?:number; averagePercent: number }[] }
export interface AcademicClass {id:number;code:string;name:string;department:string;status:string}
export interface ExamReview {id:number;code:string;title:string;status:string;courseName:string;totalPoints:number;canEdit:boolean;canClose:boolean;revisionToken?:string;questions:{id:number;position:number;content:string;points:number;answers:{label:string;content:string;correct:boolean}[]}[]}
export interface ExamContentInput {expectedToken:string;title:string;questions:{id:number|null;content:string;points:number;answers:{content:string;correct:boolean}[]}[]}
export interface AccountInput { studentClassId?:number|null; username: string; email: string; fullName: string; department: string; role: 'STUDENT' | 'TEACHER'; password: string; status: string }
export type CatalogKind = 'courses' | 'exams' | 'sessions';
export interface CatalogOption { id: number; name: string; code?: string; courseCode?: string }
export interface CatalogOptions { teachers: CatalogOption[]; courses: CatalogOption[]; exams: CatalogOption[]; classes: CatalogOption[] }
function query(filters: Partial<Filters>, page?: number, size?: number) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  if (page !== undefined) params.set('page', String(page));
  if (size !== undefined) params.set('size', String(size));
  return params.toString();
}
export interface SessionDetail {
  session: {
    id: number;
    name?: string;
    examId: number;
    examCode: string;
    examTitle: string;
    courseCode: string;
    courseName: string;
    className: string;
    roomCode: string;
    accessCode: string;
    startTime: string;
    endTime: string;
    status: string;
    registeredCount: number;
    attemptCount: number;
  };
  students: Array<{
    id: number;
    username: string;
    fullName: string;
    email: string;
    department: string;
    status: string;
  }>;
  attempts: Array<{
    id: number;
    username: string;
    studentName: string;
    startedAt: string;
    submittedAt: string | null;
    score: number | null;
    totalPoints: number;
    status: string;
    eventCount: number;
    riskScore: number;
  }>;
}

/** Map composite tabs to backend resource names. 'accounts' → 'users', 'monitor' → actual tab sub-resource */
export function resolveApiTab(tab: AdminTab, subRole?: string): string {
  if (tab === 'accounts') {
    if (subRole === 'student') return 'students';
    if (subRole === 'teacher') return 'teachers';
    return 'users';
  }
  if (tab === 'monitor') return 'attempts';
  return tab;
}

export const adminWorkspaceApi = {
  ...adminApi,
  evidenceApi,
  academicOptions: () => apiFetch<{classes:AcademicClass[]}>('/admin/users/academic-options'),
  organizationRequest:<T=unknown>(url:string,init:RequestInit={})=>apiFetch<T>(url,{...init,signal:init.signal??AbortSignal.timeout(20000)}),
  examReview:(id:number)=>apiFetch<ExamReview>(`/admin/catalog/exams/${id}/review`),
  saveExamContent:(id:number,input:ExamContentInput,copy:boolean)=>apiFetch<ExamReview>(`/admin/catalog/exams/${id}/${copy?'revision':'content'}`,{method:copy?'POST':'PUT',body:JSON.stringify(input)}),
  closeExam:(id:number)=>apiFetch<DataRow>(`/admin/catalog/exams/${id}/close`,{method:'POST'}),
  catalogOptions: () => apiFetch<CatalogOptions>('/admin/catalog/options'),
  catalogDetail: (kind: CatalogKind, id: number) => apiFetch<DataRow>(`/admin/catalog/${kind}/${id}`),
  saveCatalog: (kind: CatalogKind, id: number | null, input: Record<string, unknown>) => apiFetch<DataRow>(`/admin/catalog/${kind}${id === null ? '' : `/${id}`}`, { method: id === null ? 'POST' : 'PUT', body: JSON.stringify(input) }),
  deleteCatalog: (kind: CatalogKind, id: number) => apiFetch<void>(`/admin/catalog/${kind}/${id}`, { method: 'DELETE' }),
  page: (resource: string, filters: Partial<Filters>, page = 0, size = 20) => apiFetch<Page>(`/admin/workspace/list/${resource}?${query(filters, page, size)}`),
  report: (filters: Partial<Filters>) => apiFetch<Report>(`/admin/workspace/report?${query(filters)}`),
  review: (id: number) => apiFetch<Review>(`/admin/workspace/attempts/${id}/review`),
  saveReview: (id: number, review: Review) => apiFetch<Review>(`/admin/workspace/attempts/${id}/review`, { method: 'PUT', body: JSON.stringify(review) }),
  evidence: (attemptId: number, eventId: number) => apiFetch<Blob>(`/admin/workspace/attempts/${attemptId}/events/${eventId}/evidence`),
  createUser: (input: AccountInput) => apiFetch<AdminUser>('/admin/users', { method: 'POST', body: JSON.stringify(input) }),
  editUser: (id: number, input: AccountInput) => apiFetch<AdminUser>(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ fullName: input.fullName, department: input.department, role: input.role, status: input.status, studentClassId: input.studentClassId??null }) }),
  repairIdentity: (id:number)=>apiFetch<AdminUser>(`/admin/users/${id}/repair-identity`,{method:'POST'}),
  resetPassword: (id: number, password: string) => apiFetch<{ message: string }>(`/admin/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
  sessionDetail: (id: number) => apiFetch<SessionDetail>(`/admin/workspace/sessions/${id}/detail`),
  updateSessionStatus: (id: number, status: string) => apiFetch<SessionDetail>(`/admin/workspace/sessions/${id}/status?status=${encodeURIComponent(status)}`, { method: 'PATCH' }),
};
export type WorkspaceApi = typeof adminWorkspaceApi;
