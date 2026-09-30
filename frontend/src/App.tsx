/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './components/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { StudentPortalPage } from './components/student/StudentPortalPage';
import { ThemeProvider } from './context/ThemeContext';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { ROUTES } from './constants/routes';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        {/* Floating Theme Switcher accessible from any page */}
        <ThemeSwitcher />

        <Routes>
          <Route path={ROUTES.LOGIN} element={<LoginPage />} />
          <Route path={ROUTES.DASHBOARD} element={<DashboardPage />} />
          <Route path={ROUTES.STUDENT} element={<StudentPortalPage />} />
          {/* Default route redirecting to login */}
          <Route path={ROUTES.HOME} element={<Navigate to={ROUTES.LOGIN} replace />} />
          {/* Fallback route */}
          <Route path="*" element={<Navigate to={ROUTES.LOGIN} replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

