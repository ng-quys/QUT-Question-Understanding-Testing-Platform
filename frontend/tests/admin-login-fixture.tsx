// Layout-only sign-in fixture. Do not submit real credentials here.
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AdminLoginPage } from '../../frontend-admin/src/features/admin/pages/AdminLoginPage';
createRoot(document.getElementById('root')!).render(<BrowserRouter><AdminLoginPage /></BrowserRouter>);
