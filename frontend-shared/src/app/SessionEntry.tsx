import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getAuthSession, getToken } from '../features/auth/services/authService';
import { ROUTES } from './routes';
import { sessionHome } from './sessionHome';

/** Visiting a login/history entry must not sign out an existing session. */
export function SessionEntry({ children }: { children?: ReactNode }) {
  const home = sessionHome(getAuthSession(), getToken());
  if (home) return <Navigate to={home} replace />;
  return children ?? <Navigate to={ROUTES.LOGIN} replace />;
}
