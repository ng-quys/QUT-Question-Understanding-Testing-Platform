import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../app/routes';
import { getAuthSession, logout } from '../../auth/services/authService';
import { AdminWorkspace } from '../components/AdminWorkspace';

export function AdminPage() {
  const navigate = useNavigate();
  const auth = getAuthSession();
  const [error, setError] = useState('');
  useEffect(() => { if (auth?.role !== 'admin') navigate(ROUTES.ADMIN_LOGIN, { replace: true }); }, [auth?.role, navigate]);
  if (!auth || auth.role !== 'admin') return null;
  async function signOut() { try { await logout(); } catch { setError('Chưa thể đăng xuất. Vui lòng thử lại.'); } }
  return <>{error && <div role="alert" className="admin-logout-error">{error}<button onClick={() => setError('')}>Đóng</button></div>}<AdminWorkspace fullName={auth.fullName || 'Quản trị viên'} email={auth.email} onLogout={() => void signOut()} /></>;
}
