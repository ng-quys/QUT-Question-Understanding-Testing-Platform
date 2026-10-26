/** Public frontend origins only; never put tokens in cross-app links. */
function appOrigin(configured: string | undefined, development: string): string {
  const value = configured?.trim() || (import.meta.env.DEV ? development : '');
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : '';
  } catch { return ''; }
}
export const ADMIN_ORIGIN = appOrigin(import.meta.env.VITE_ADMIN_URL, 'http://localhost:5174');
export const PORTAL_ORIGIN = appOrigin(import.meta.env.VITE_PORTAL_URL, 'http://localhost:5173');
