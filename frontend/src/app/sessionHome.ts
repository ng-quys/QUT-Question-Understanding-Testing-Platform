import type { AuthSession } from '../features/auth/services/authService';
import { ROUTES } from './routes';

export function sessionHome(session: AuthSession | null, token: string | undefined) {
  if (!session || !token) return null;
  switch (session.role) {
    case 'admin': return ROUTES.ADMIN;
    case 'student': return ROUTES.STUDENT;
    case 'faculty': return ROUTES.DASHBOARD;
    default: return null;
  }
}
