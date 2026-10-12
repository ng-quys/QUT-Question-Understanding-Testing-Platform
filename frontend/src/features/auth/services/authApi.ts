import { apiFetch } from '../../../services/api';
import type { UserRole } from '../../../types';

export type RegistrationRole = 'STUDENT' | 'TEACHER';

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: RegistrationRole;
}

export interface SocialUserSyncResponse {
  id: number;
  keycloakUserId: string;
  username: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  created: boolean;
}

const API_URL = 'http://localhost:8080';

export async function register(data: RegisterRequest): Promise<void> {
  const response = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Register failed: ${response.status}`);
  }
}

/**
 * Creates/links the application DB user after a successful
 * Google/Microsoft Keycloak login.
 *
 * Email, name and Keycloak user ID are read by the backend from the JWT.
 */
export async function syncSocialUser(
  role: UserRole
): Promise<SocialUserSyncResponse> {
  const registrationRole: RegistrationRole =
    role === 'faculty' ? 'TEACHER' : 'STUDENT';

  return apiFetch<SocialUserSyncResponse>('/auth/sync-user', {
    method: 'POST',
    body: JSON.stringify({
      role: registrationRole,
    }),
  });
}
