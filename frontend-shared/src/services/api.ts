import { getValidAccessToken } from '../features/auth/services/authService';
import { localizedError } from './errorMessages';

import { API_BASE_URL } from './apiBase';
export { API_BASE_URL } from './apiBase';

/**
 * Generic authenticated API request.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  try {
  const headers = new Headers(init.headers ?? {});

  // =========================================================
  // CONTENT TYPE
  // =========================================================

  if (
    !headers.has('Content-Type') &&
    init.body &&
    !(init.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json');
  }

  // =========================================================
  // AUTHENTICATION
  // =========================================================

  const token = await getValidAccessToken();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  } else {
    headers.delete('Authorization');
  }

  const authMode = token ? 'database-session' : 'none';

  console.debug('[apiFetch]', {
    method: init.method ?? 'GET',
    path,
    hasToken: Boolean(token),
    authMode,
  });

  // =========================================================
  // REQUEST
  // =========================================================

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  // =========================================================
  // ERROR HANDLING
  // =========================================================

  if (!response.ok) {
    let message = response.status === 403
      ? 'Tài khoản hiện tại không có quyền thực hiện thao tác này. Vui lòng đăng nhập đúng tài khoản quản trị ở tab admin.'
      : response.status === 401
        ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
        : `HTTP ${response.status}`;

    try {
      const body = await response.json();

      message =
        body?.message ??
        body?.error_description ??
        body?.error ??
        message;
    } catch {
      // Ignore non-JSON error body.
    }

    if (response.status === 401) {
      console.error(
        '[apiFetch] Backend rejected authentication',
        {
          path,
          hasToken: Boolean(token),
          authMode,
        }
      );
    }

    throw localizedError(message, { status: response.status });
  }

  // =========================================================
  // RESPONSE
  // =========================================================

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType =
    response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return await response.json() as T;
  }

  if (/^(image|video|audio)\//.test(contentType) || contentType.includes('application/octet-stream')) {
    return await response.blob() as T;
  }

  return await response.text() as T;
  } catch (error) {
    throw localizedError(error);
  }
}

/**
 * Test authenticated backend endpoint.
 */
export async function getPrivateTest(): Promise<string> {
  return apiFetch<string>('/test/private', {
    method: 'GET',
  });
}
