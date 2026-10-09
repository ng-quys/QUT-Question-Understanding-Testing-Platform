import keycloak from './keycloak';
import {
  getToken,
  refreshCredentialToken,
  logout as clearCredentialSession,
} from '../features/auth/services/authService';

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api';

/**
 * Check whether JWT is expired or about to expire.
 */
function isTokenExpired(
  token: string,
  minValiditySeconds = 30
): boolean {
  try {
    const parts = token.split('.');

    if (parts.length !== 3) {
      return true;
    }

    let payloadBase64 = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    // Fix missing base64 padding.
    while (payloadBase64.length % 4 !== 0) {
      payloadBase64 += '=';
    }

    const payload = JSON.parse(atob(payloadBase64));

    if (typeof payload.exp !== 'number') {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);

    return payload.exp <= now + minValiditySeconds;
  } catch (error) {
    console.error('[auth] Invalid access token:', error);
    return true;
  }
}

/**
 * Try to clear the Direct Grant session.
 *
 * authService implementations may expose logout() differently,
 * so failure here must not break apiFetch.
 */
function clearDirectGrantSession(): void {
  try {
    const result = clearCredentialSession();

    // Avoid unhandled promise rejection if logout is async.
    if (
      result &&
      typeof (result as Promise<unknown>).catch === 'function'
    ) {
      void (result as Promise<unknown>).catch((error) => {
        console.warn(
          '[auth] Could not completely clear credential session:',
          error
        );
      });
    }
  } catch (error) {
    console.warn(
      '[auth] Could not completely clear credential session:',
      error
    );
  }
}

/**
 * Return an access token from either:
 *
 * 1. Keycloak browser/social login
 * 2. Email/password Direct Grant login
 */
async function getValidAccessToken(): Promise<string | undefined> {
  // =========================================================
  // 1. KEYCLOAK BROWSER / SOCIAL LOGIN
  // =========================================================

  if (keycloak.authenticated) {
    if (!keycloak.token) {
      console.warn(
        '[auth] Keycloak is authenticated but access token is missing.'
      );

      return undefined;
    }

    try {
      await keycloak.updateToken(30);
      return keycloak.token;
    } catch (error) {
      console.error(
        '[auth] Failed to refresh Keycloak browser token:',
        error
      );

      keycloak.clearToken();
      return undefined;
    }
  }

  // =========================================================
  // 2. EMAIL / PASSWORD DIRECT GRANT
  // =========================================================

  let token = getToken();

  if (!token) {
    return undefined;
  }

  // Access token is still valid -> use it directly.
  if (!isTokenExpired(token, 30)) {
    return token;
  }

  // Access token expired -> attempt refresh ONCE.
  try {
    const refreshed = await refreshCredentialToken();

    if (!refreshed?.access_token) {
      console.warn(
        '[auth] Refresh response did not contain access_token.'
      );

      clearDirectGrantSession();
      return undefined;
    }

    token = refreshed.access_token;
    return token;
  } catch (error) {
    console.error(
      '[auth] Direct Grant session expired. Clearing local session.',
      error
    );

    clearDirectGrantSession();

    return undefined;
  }
}

/**
 * Generic authenticated API request.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
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

  const authMode =
    keycloak.authenticated && keycloak.token
      ? 'keycloak-browser'
      : token
        ? 'direct-grant'
        : 'none';

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
    let message = `HTTP ${response.status}`;

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

    throw new Error(message);
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
    return response.json() as Promise<T>;
  }

  return response.text() as Promise<T>;
}

/**
 * Test authenticated backend endpoint.
 */
export async function getPrivateTest(): Promise<string> {
  return apiFetch<string>('/test/private', {
    method: 'GET',
  });
}