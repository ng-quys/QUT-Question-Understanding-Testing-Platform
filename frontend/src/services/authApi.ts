export type RegistrationRole = 'STUDENT' | 'TEACHER';

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: RegistrationRole;
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