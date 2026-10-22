import { apiFetch } from '../../../services/api';

export type EvidenceAudience = 'admin' | 'teacher';
export interface EvidenceEvent {
  id: number; event: string; active: boolean; occurredAt: string; module: string;
  duration: number; riskScore: number; riskLevel: string; provider: string;
  evidenceStatus: string; hasEvidence: boolean; evidenceError?: string;
}
export interface EvidencePage { items: EvidenceEvent[]; total: number; page: number; size: number; attemptStatus?: string }
export interface EvidenceLink { url: string | null; expiresAt: string | null; provider: 'local' | 'supabase' }
export interface HistoryAttempt { id: number; studentName: string; studentUsername: string; examTitle: string; courseCode: string; sessionId: number; status: string; score: number | null; totalPoints: number; startedAt: string; submittedAt: string | null }
const base = (audience: EvidenceAudience, attempt: number) => `/${audience}/evidence/attempts/${attempt}/events`;
export const evidenceApi = {
  events: (audience: EvidenceAudience, attempt: number, page: number, signal?: AbortSignal) => apiFetch<EvidencePage>(`${base(audience, attempt)}?page=${page}&size=20`, { signal }),
  link: (audience: EvidenceAudience, attempt: number, event: number) => apiFetch<EvidenceLink>(`${base(audience, attempt)}/${event}/link`),
  local: (audience: EvidenceAudience, attempt: number, event: number) => apiFetch<Blob>(`${base(audience, attempt)}/${event}/local`),
  history: (page: number, q: string, sessionId?: number) => apiFetch<{ items: HistoryAttempt[]; total: number }>(`/teacher/evidence/history?page=${page}&size=20&q=${encodeURIComponent(q)}${sessionId ? `&sessionId=${sessionId}` : ''}`),
};
