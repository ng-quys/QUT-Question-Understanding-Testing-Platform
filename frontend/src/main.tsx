import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

import keycloak from './services/keycloak';

const initializeApp = async () => {
  try {
    const authenticated =
      await keycloak.init({
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        checkLoginIframe: false,
      });

    console.log(
      'Keycloak initialized. Authenticated:',
      authenticated
    );

    createRoot(
      document.getElementById('root')!
    ).render(<App />);
  } catch (error) {
    console.error(
      'Keycloak initialization failed:',
      error
    );

    createRoot(
      document.getElementById('root')!
    ).render(<App />);
  }
};

initializeApp();