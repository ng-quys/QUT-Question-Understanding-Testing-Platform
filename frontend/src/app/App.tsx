/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { DashboardPage } from '../features/dashboard/pages/DashboardPage';
import { StudentPortalPage } from '../features/student/pages/StudentPortalPage';
import { ThemeProvider } from './providers/ThemeProvider';
import { ROUTES } from './routes';
import { AdminPage } from '../features/admin/pages/AdminPage';
import { AdminLoginPage } from '../features/admin/pages/AdminLoginPage';
import { SessionEntry } from './SessionEntry';
import { WorkspaceHistoryBoundary } from './WorkspaceHistoryBoundary';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <WorkspaceHistoryBoundary />
        {/* Floating Theme Switcher accessible from any page */}


        <Routes>
          <Route path={ROUTES.LOGIN} element={<SessionEntry><LoginPage /></SessionEntry>} />
          <Route path={ROUTES.DASHBOARD} element={<DashboardPage />} />
          <Route path={ROUTES.STUDENT} element={<StudentPortalPage />} />
          <Route path={ROUTES.HOME} element={<SessionEntry />} />
          <Route path="*" element={<SessionEntry />} />
          <Route path={ROUTES.ADMIN_LOGIN} element={<SessionEntry><AdminLoginPage /></SessionEntry>} />
          <Route path={ROUTES.ADMIN} element={<AdminPage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

