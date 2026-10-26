const adminApp = import.meta.env.VITE_APP_KIND === 'admin';
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  STUDENT: '/student',
  ADMIN: adminApp ? '/' : '/admin',
  ADMIN_LOGIN: adminApp ? '/login' : '/admin/login',
} as const;

export type AppRoute = typeof ROUTES[keyof typeof ROUTES];
