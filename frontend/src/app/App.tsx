/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { DashboardPage } from '../features/dashboard/pages/DashboardPage';
import { StudentPortalPage } from '../features/student/pages/StudentPortalPage';
import { ThemeProvider } from './providers/ThemeProvider';
import { ROUTES } from './routes';
import { AdminPage } from '../features/admin/pages/AdminPage';
import { AdminLoginPage } from '../features/admin/pages/AdminLoginPage';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        {/* Floating Theme Switcher accessible from any page */}


        <Routes>
          <Route path={ROUTES.LOGIN} element={<LoginPage />} />
          <Route path={ROUTES.DASHBOARD} element={<DashboardPage />} />
          <Route path={ROUTES.STUDENT} element={<StudentPortalPage />} />
          {/* Default route redirecting to login */}
          <Route path={ROUTES.HOME} element={<Navigate to={ROUTES.LOGIN} replace />} />
          {/* Fallback route */}
          <Route path="*" element={<Navigate to={ROUTES.LOGIN} replace />} />
          <Route path={ROUTES.ADMIN_LOGIN} element={<AdminLoginPage />} />
          <Route path={ROUTES.ADMIN} element={<AdminPage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

