import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: 'http://localhost:8081',
  realm: 'online-exam-system',
  clientId: 'online-exam-frontend',
});

export default keycloak;