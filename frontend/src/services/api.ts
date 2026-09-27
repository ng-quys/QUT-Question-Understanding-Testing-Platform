import keycloak from './keycloak';

const API_URL = 'http://localhost:8080';

export async function getPrivateTest() {
  await keycloak.updateToken(30);

  const response = await fetch(`${API_URL}/api/test/private`, {
    method: 'GET',

    headers: {
      Authorization: `Bearer ${keycloak.token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.text();
}