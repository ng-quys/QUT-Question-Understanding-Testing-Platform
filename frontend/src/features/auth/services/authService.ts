import axios from 'axios';
import keycloak from '../../../services/keycloak';
import type { UserRole } from '../../../types';

const KEYCLOAK_URL = 'http://localhost:8081';
const REALM_NAME = 'online-exam-system';
const CLIENT_ID = 'online-exam-frontend';

/**
 * Session format used by the frontend.
 *
 * Kept for compatibility with existing components
 * that still use examflow_auth.
 */
export interface AuthSession {
  token: string;
  userId?: number;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  department?: string;
}

/**
 * =========================================================
 * SESSION STORAGE
 * =========================================================
 */

export function saveAuthSession(
  session: AuthSession,
  remember: boolean
) {
  localStorage.removeItem('examflow_auth');
  sessionStorage.removeItem('examflow_auth');

  const storage = remember
    ? localStorage
    : sessionStorage;

  storage.setItem(
    'examflow_auth',
    JSON.stringify(session)
  );
}

export function getAuthSession(): AuthSession | null {
  const raw =
    localStorage.getItem('examflow_auth') ??
    sessionStorage.getItem('examflow_auth');

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function clearAuthSession() {
  localStorage.removeItem('examflow_auth');
  sessionStorage.removeItem('examflow_auth');
}

/**
 * Remove tokens created by Direct Grant login.
 */
const clearLocalAuth = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('id_token');

  clearAuthSession();
};

/**
 * =========================================================
 * EMAIL / PASSWORD LOGIN
 * =========================================================
 *
 * Uses Keycloak Direct Access Grant.
 *
 * IMPORTANT:
 * Do not assign these tokens manually to keycloak.token.
 * keycloak-js manages browser/social login separately.
 */
export const loginWithCredentials = async (
  email: string,
  password: string
) => {
  // Direct Grant and browser SSO must not be active at the same time.
  // Otherwise apiFetch may keep using the previous social-login token.
  if (keycloak.authenticated || keycloak.token) {
    keycloak.clearToken();
  }

  clearLocalAuth();

  const params = new URLSearchParams();

  params.append('client_id', CLIENT_ID);
  params.append('grant_type', 'password');
  params.append('username', email);
  params.append('password', password);

  const response = await axios.post(
    `${KEYCLOAK_URL}/realms/${REALM_NAME}/protocol/openid-connect/token`,
    params,
    {
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
    }
  );

  const {
    access_token,
    refresh_token,
    id_token,
  } = response.data;

  localStorage.setItem(
    'access_token',
    access_token
  );

  if (refresh_token) {
    localStorage.setItem(
      'refresh_token',
      refresh_token
    );
  }

  if (id_token) {
    localStorage.setItem(
      'id_token',
      id_token
    );
  }

  return response.data;
};


/**
 * Refresh the Direct Grant access token.
 *
 * This is required after /api/auth/sync-user assigns an application realm
 * role, because the access token issued before the role change still contains
 * the old realm_access.roles claim.
 */
export const refreshCredentialToken = async () => {
  const refreshToken = localStorage.getItem('refresh_token');

  if (!refreshToken) {
    throw new Error('Refresh token was not found');
  }

  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refreshToken);

  const response = await axios.post(
    `${KEYCLOAK_URL}/realms/${REALM_NAME}/protocol/openid-connect/token`,
    params,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  localStorage.setItem('access_token', response.data.access_token);

  if (response.data.refresh_token) {
    localStorage.setItem('refresh_token', response.data.refresh_token);
  }

  if (response.data.id_token) {
    localStorage.setItem('id_token', response.data.id_token);
  }

  return response.data;
};

/**
 * =========================================================
 * LOGOUT
 * =========================================================
 *
 * Supports:
 *
 * 1. Keycloak browser/social login
 * 2. Email/password Direct Grant login
 */
export const logout = async () => {
  const refreshToken =
    localStorage.getItem('refresh_token');

  /**
   * Browser / Google / Microsoft login
   */
  if (keycloak.authenticated) {
    clearLocalAuth();

    try {
      await keycloak.logout({
        redirectUri:
          `${window.location.origin}/login`,
      });

      return;
    } catch (error) {
      console.error(
        'Keycloak logout failed:',
        error
      );

      keycloak.clearToken();

      window.location.replace('/login');

      return;
    }
  }

  /**
   * Email/password Direct Grant login
   */
  try {
    if (refreshToken) {
      const params = new URLSearchParams();

      params.append(
        'client_id',
        CLIENT_ID
      );

      params.append(
        'refresh_token',
        refreshToken
      );

      await axios.post(
        `${KEYCLOAK_URL}/realms/${REALM_NAME}/protocol/openid-connect/logout`,
        params,
        {
          headers: {
            'Content-Type':
              'application/x-www-form-urlencoded',
          },
        }
      );
    }
  } catch (error) {
    console.error(
      'Direct Grant logout failed:',
      error
    );
  } finally {
    clearLocalAuth();

    window.location.replace('/login');
  }
};

/**
 * =========================================================
 * CHECK AUTHENTICATION
 * =========================================================
 */
export const isAuthenticated = (): boolean => {
  // Email/password Direct Grant
  const localToken =
    localStorage.getItem('access_token');

  if (localToken) {
    return true;
  }

  // Keycloak browser/social login
  return Boolean(
    keycloak.authenticated &&
    keycloak.token
  );
};

/**
 * =========================================================
 * GET ACCESS TOKEN
 * =========================================================
 */
export const getToken = (): string | undefined => {
  // Browser/social login takes priority when it is the active mode.
  if (keycloak.authenticated && keycloak.token) {
    return keycloak.token;
  }

  // Email/password Direct Grant.
  return localStorage.getItem('access_token') ?? undefined;
};

/**
 * =========================================================
 * GET CURRENT USER
 * =========================================================
 */
export const getUser = () => {
  if (!keycloak.tokenParsed) {
    return null;
  }

  return {
    id: keycloak.tokenParsed.sub,

    username:
      keycloak.tokenParsed.preferred_username,

    email:
      keycloak.tokenParsed.email,

    firstName:
      keycloak.tokenParsed.given_name,

    lastName:
      keycloak.tokenParsed.family_name,
  };
};