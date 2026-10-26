/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { DashboardPage } from '../features/dashboard/pages/DashboardPage';
import { StudentPortalPage } from '../features/student/pages/StudentPortalPage';
import { ThemeProvider } from '@shared/app/providers/ThemeProvider';
import { ROUTES } from '@shared/app/routes';
import { LegacyAdminRedirect } from './LegacyAdminRedirect';
import { SessionEntry } from '@shared/app/SessionEntry';
import { WorkspaceHistoryBoundary } from '@shared/app/WorkspaceHistoryBoundary';

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
          <Route path={ROUTES.ADMIN_LOGIN} element={<LegacyAdminRedirect login />} />
          <Route path="/admin/*" element={<LegacyAdminRedirect />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

