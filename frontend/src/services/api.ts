import keycloak from './keycloak';
import { getToken } from './authService';

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api';

/**
 * Generic API request function.
 *
 * Supports both:
 * 1. Email/password login (Direct Grant)
 * 2. Keycloak browser/social login
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers ?? {});

  // Add Content-Type automatically when request has a body
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  /**
   * =========================================================
   * AUTHENTICATION
   * =========================================================
   */

  let token: string | undefined;

  // CASE 1:
  // Browser / Google / Microsoft login managed by keycloak-js
  if (keycloak.authenticated) {
    try {
      // Refresh token if it will expire within 30 seconds
      await keycloak.updateToken(30);

      token = keycloak.token;
    } catch (error) {
      console.error(
        'Failed to refresh Keycloak token:',
        error
      );

      throw new Error(
        'Authentication session expired',
        {
          cause: error,
        }
      );
    }
  } else {
    // CASE 2:
    // Email/password Direct Grant login.
    // Token is stored in localStorage by authService.ts
    token = getToken();
  }

  // Attach access token to backend request
  if (token) {
    headers.set(
      'Authorization',
      `Bearer ${token}`
    );
  }

  /**
   * =========================================================
   * REQUEST
   * =========================================================
   */

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      ...init,
      headers,
    }
  );

  /**
   * =========================================================
   * ERROR HANDLING
   * =========================================================
   */

  if (!response.ok) {
    let message = `HTTP ${response.status}`;

    try {
      const body = await response.json();

      message =
        body.message ??
        body.error ??
        message;
    } catch {
      // Response is not JSON
    }

    throw new Error(message);
  }

  /**
   * =========================================================
   * RESPONSE HANDLING
   * =========================================================
   */

  // No Content
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType =
    response.headers.get('content-type');

  // JSON response
  if (contentType?.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  // Text response
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