export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api';

const getToken = () => {
  const raw = localStorage.getItem('examflow_auth') ?? sessionStorage.getItem('examflow_auth');
  if (!raw) return null;
  try {
    return JSON.parse(raw).token as string;
  } catch {
    return null;
  }
};

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body.message ?? message;
    } catch {
      // ignore non-JSON errors
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
