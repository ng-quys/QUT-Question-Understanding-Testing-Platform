import { apiFetch } from './api';
import type { UserRole } from '../types';

export interface AuthSession {
  token: string;
  userId: number;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  department?: string;
}

export async function login(email: string, password: string, role: UserRole): Promise<AuthSession> {
  return apiFetch<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, role }),
  });
}

export function saveAuthSession(session: AuthSession, remember: boolean) {
  localStorage.removeItem('examflow_auth');
  sessionStorage.removeItem('examflow_auth');
  (remember ? localStorage : sessionStorage).setItem('examflow_auth', JSON.stringify(session));
}

export function getAuthSession(): AuthSession | null {
  const raw = localStorage.getItem('examflow_auth') ?? sessionStorage.getItem('examflow_auth');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function clearAuthSession() {
  localStorage.removeItem('examflow_auth');
  sessionStorage.removeItem('examflow_auth');
}
