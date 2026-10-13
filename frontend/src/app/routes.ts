export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  STUDENT: '/student',
  ADMIN: '/admin',
ADMIN_LOGIN: '/admin/login',
} as const;

export type AppRoute = typeof ROUTES[keyof typeof ROUTES];
