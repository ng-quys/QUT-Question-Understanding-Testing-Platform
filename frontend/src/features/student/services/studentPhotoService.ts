import keycloak from '../../../services/keycloak';
import { API_BASE_URL } from '../../../services/api';
import { getToken, refreshCredentialToken } from '../../auth/services/authService';

// Photos are binary; shared apiFetch currently only supports JSON/text.
export async function loadStudentPhoto(): Promise<Blob> {
  let token: string | undefined;
  if (keycloak.authenticated) {
    await keycloak.updateToken(30);
    token = keycloak.token;
  } else {
    token = getToken() ?? undefined;
    if (token) {
      let expiresSoon = true;
      try {
        const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
        expiresSoon = typeof payload.exp !== 'number' || payload.exp <= Date.now() / 1000 + 30;
      } catch {
        expiresSoon = true;
      }
      if (expiresSoon) {
        const refreshed = await refreshCredentialToken();
        token = refreshed?.access_token;
      }
    }
  }
  if (!token) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  const response = await fetch(`${API_BASE_URL}/student/profile/photo`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Không thể tải ảnh (HTTP ${response.status})`);
  }
  return response.blob();
}
