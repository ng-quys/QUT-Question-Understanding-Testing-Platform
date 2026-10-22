// A reverse proxy serves /api in production; local development uses port 8080.
export const API_BASE_URL = (import.meta.env.VITE_API_URL?.trim() ||
  (import.meta.env.PROD ? '/api' : 'http://localhost:8080/api')).replace(/\/$/, '');
