export const ROUTES = {
  ADMIN: '/admin',
  ADMIN_LOGIN: '/admin/login',
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  STUDENT: '/student',
} as const;

export type AppRoute = typeof ROUTES[keyof typeof ROUTES];
