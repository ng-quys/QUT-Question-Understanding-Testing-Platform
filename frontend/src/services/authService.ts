import axios from 'axios';
import keycloak from './keycloak';

const KEYCLOAK_URL = 'http://localhost:8081';
const REALM_NAME = 'online-exam-system';
const CLIENT_ID = 'online-exam-frontend';

/**
 * Xóa token của Email/Password Direct Grant.
 *
 * Google login KHÔNG lưu token bằng cách này.
 * Google login để keycloak-js quản lý.
 */
const clearLocalAuth = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('id_token');
};

/**
 * =========================================================
 * EMAIL / PASSWORD LOGIN
 * =========================================================
 *
 * Login bằng Direct Access Grant.
 *
 * QUAN TRỌNG:
 * Không gán token này vào keycloak.token.
 *
 * Direct Grant và Browser Login (Google) là 2 flow khác nhau.
 */
export const loginWithCredentials = async (
  email: string,
  password: string
) => {
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
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  const {
    access_token,
    refresh_token,
    id_token,
  } = response.data;

  // Xóa token cũ trước.
  clearLocalAuth();

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
 * =========================================================
 * LOGOUT
 * =========================================================
 *
 * Hỗ trợ cả:
 *
 * 1. Google / Social Login
 * 2. Email / Password Direct Grant
 */
export const logout = async () => {
  const refreshToken =
    localStorage.getItem('refresh_token');

  // GOOGLE / MICROSOFT
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

  // EMAIL / PASSWORD
  try {
    if (refreshToken) {
      const params =
        new URLSearchParams();

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
  /**
   * Email/password Direct Grant.
   */
  const localToken =
    localStorage.getItem('access_token');

  if (localToken) {
    return true;
  }

  /**
   * Google / Keycloak browser authentication.
   */
  return Boolean(
    keycloak.authenticated &&
    keycloak.token
  );
};

/**
 * =========================================================
 * GET ACCESS TOKEN
 * =========================================================
 *
 * API interceptor có thể gọi function này.
 */
export const getToken = (): string | undefined => {
  /**
   * Ưu tiên Direct Grant token.
   */
  const localToken =
    localStorage.getItem('access_token');

  if (localToken) {
    return localToken;
  }

  /**
   * Nếu login Google thì lấy token
   * do keycloak-js quản lý.
   */
  return keycloak.token;
};

/**
 * =========================================================
 * GET USER
 * =========================================================
 *
 * Hiện tại tokenParsed này dành cho Browser Login
 * như Google.
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