import { clearTabAuth, getAuthSession } from '@shared/features/auth/services/authService';

/** Retire only the old admin session on the portal origin during migration. */
export function clearLegacyAdminSession() {
  if (getAuthSession()?.role === 'admin') clearTabAuth();
}
