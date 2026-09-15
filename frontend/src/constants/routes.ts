export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
} as const;

export type AppRoute = typeof ROUTES[keyof typeof ROUTES];
