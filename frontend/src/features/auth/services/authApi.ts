import { apiFetch } from '@shared/services/api';
export type RegistrationRole = 'STUDENT' | 'TEACHER';

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: RegistrationRole;
}



export async function register(data: RegisterRequest): Promise<void> {
  await apiFetch('/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

}
