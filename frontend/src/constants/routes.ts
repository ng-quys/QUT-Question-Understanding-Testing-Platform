export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  STUDENT: '/student',
} as const;

export type AppRoute = typeof ROUTES[keyof typeof ROUTES];
