export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  STUDENT: '/student',
  ADMIN: '/admin',
} as const;

export type AppRoute = typeof ROUTES[keyof typeof ROUTES];
