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

// Credentials and the matching profile belong to the current browser tab.
// Shared localStorage lets a student login overwrite an admin in another tab.
export function saveAuthSession(session: AuthSession, _remember: boolean) {
  sessionStorage.setItem('examflow_auth', JSON.stringify(session));
}

export function getAuthSession(): AuthSession | null {
  const raw = sessionStorage.getItem('examflow_auth');
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthSession; } catch { return null; }
}

export function clearAuthSession() {
  sessionStorage.removeItem('examflow_auth');
}

export const clearTabAuth = () => {
  for (const key of ['access_token', 'refresh_token', 'id_token']) {
    sessionStorage.removeItem(key);
  }
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
  username: string,
  password: string
) => {
  // Direct Grant and browser SSO must not be active at the same time.
  // Otherwise apiFetch may keep using the previous social-login token.
  if (keycloak.authenticated || keycloak.token) {
    keycloak.clearToken();
  }

  clearTabAuth();

  const params = new URLSearchParams();

  params.append('client_id', CLIENT_ID);
  params.append('grant_type', 'password');
  params.append('username', username);
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

  sessionStorage.setItem(
    'access_token',
    access_token
  );

  if (refresh_token) {
    sessionStorage.setItem(
      'refresh_token',
      refresh_token
    );
  }

  if (id_token) {
    sessionStorage.setItem(
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
let credentialRefresh: {token:string;promise:Promise<any>} | undefined;
export const refreshCredentialToken = (): Promise<any> => {
  const refreshToken = sessionStorage.getItem('refresh_token');
  if (!refreshToken) return Promise.reject({response:{status:401},message:'Refresh token was not found'});
  if(credentialRefresh?.token===refreshToken)return credentialRefresh.promise;
  const promise=(async()=>{
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/${REALM_NAME}/protocol/openid-connect/token`, params,
      {headers:{'Content-Type':'application/x-www-form-urlencoded'},timeout:8000},
    ).catch(error=>{
      if(sessionStorage.getItem('refresh_token')!==refreshToken)throw new Error('Phiên đăng nhập đã thay đổi.');
      throw error;
    });
    // A delayed refresh must never resurrect a logout or replace another login in this tab.
    if(sessionStorage.getItem('refresh_token')!==refreshToken)throw new Error('Phiên đăng nhập đã thay đổi.');
    if(!response.data.access_token)throw new Error('Dịch vụ đăng nhập chưa trả về phiên hợp lệ.');
    sessionStorage.setItem('access_token',response.data.access_token);
    if(response.data.refresh_token)sessionStorage.setItem('refresh_token',response.data.refresh_token);
    if(response.data.id_token)sessionStorage.setItem('id_token',response.data.id_token);
    return response.data;
  })().finally(()=>{if(credentialRefresh?.promise===promise)credentialRefresh=undefined;});
  credentialRefresh={token:refreshToken,promise};
  return promise;
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
    sessionStorage.getItem('refresh_token');

  /**
   * Browser / Google / Microsoft login
   */
  if (keycloak.authenticated) {
    clearTabAuth();

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
    clearTabAuth();

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
    sessionStorage.getItem('access_token');

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
  return sessionStorage.getItem('access_token') ?? undefined;
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
