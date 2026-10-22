import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ThemeProvider } from '@shared/app/providers/ThemeProvider';
import { SessionEntry } from '@shared/app/SessionEntry';
import { WorkspaceHistoryBoundary } from '@shared/app/WorkspaceHistoryBoundary';
import { getAuthSession, getToken } from '@shared/features/auth/services/authService';
import { AdminLoginPage } from '../features/admin/pages/AdminLoginPage';
const AdminPage = lazy(() => import('../features/admin/pages/AdminPage').then(module => ({ default: module.AdminPage })));

function AdminRoot() {
  if (getAuthSession()?.role !== 'admin' || !getToken()) return <Navigate to="/login" replace/>;
  return <Suspense fallback={<p className="p-8 text-center text-slate-500" role="status">Đang mở giao diện quản trị…</p>}><AdminPage/></Suspense>;
}

export default function App() {
  return <ThemeProvider><BrowserRouter><WorkspaceHistoryBoundary/><Routes>
    <Route path="/" element={<AdminRoot/>}/>
    <Route path="/login" element={<SessionEntry><AdminLoginPage/></SessionEntry>}/>
    <Route path="/admin/login" element={<Navigate to="/login" replace/>}/>
    <Route path="/admin/*" element={<Navigate to="/" replace/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></BrowserRouter></ThemeProvider>;
}
