import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../../services/api';
import { ROUTES } from '../../../app/routes';
import { loginWithCredentials, saveAuthSession, clearAuthSession, type AuthSession } from '../../auth/services/authService';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const tokens = await loginWithCredentials(username.trim(), password);
      // The backend verifies the signed ADMIN role and the local account status.
      const profile = await apiFetch<Omit<AuthSession, 'token'>>('/admin/me');
      saveAuthSession({ ...profile, token: tokens.access_token }, false);
      navigate(ROUTES.ADMIN, { replace: true });
    } catch (cause) {
      clearAuthSession();
      for (const key of ['access_token', 'refresh_token', 'id_token']) localStorage.removeItem(key);
      setError(cause instanceof Error ? cause.message : 'Không thể đăng nhập Admin');
    } finally {
      setBusy(false);
    }
  }

  return <main className="min-h-screen app-bg-main flex items-center justify-center p-6">
    <form onSubmit={submit} className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-lg">
      <h1 className="text-2xl font-bold text-slate-900">Đăng nhập Admin</h1>
      <p className="text-sm text-slate-500 mt-2 mb-6">Dùng tài khoản quản trị đã được cấp quyền trong Keycloak.</p>
      {error && <p role="alert" className="mb-4 text-sm text-rose-700">{error}</p>}
      <label className="block text-sm font-semibold mb-2" htmlFor="admin-username">Tên đăng nhập hoặc email</label>
      <input id="admin-username" autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} className="w-full border rounded-lg p-3 mb-4" />
      <label className="block text-sm font-semibold mb-2" htmlFor="admin-password">Mật khẩu</label>
      <input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full border rounded-lg p-3 mb-6" />
      <button disabled={busy} className="w-full rounded-lg p-3 text-white font-bold disabled:opacity-50" style={{background:'var(--primary)'}}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      <Link to={ROUTES.LOGIN} className="block text-center text-sm text-slate-600 mt-5">Về trang đăng nhập sinh viên / giảng viên</Link>
    </form>
  </main>;
}
