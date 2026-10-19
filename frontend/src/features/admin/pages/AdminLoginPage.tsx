import { useState, type FormEvent } from 'react';
import { AlertCircle, ArrowLeft, BookOpen, CalendarDays, Check, Eye, EyeOff, FileText, Loader2, LockKeyhole } from 'lucide-react';
import '../styles/admin.css';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../../services/api';
import { ROUTES } from '../../../app/routes';
import { loginWithCredentials, saveAuthSession, clearTabAuth, type AuthSession } from '../../auth/services/authService';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

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
      clearTabAuth();
      setError(cause instanceof Error ? cause.message : 'Không thể đăng nhập Admin');
    } finally {
      setBusy(false);
    }
  }

  return <main className="admin-login">
    <header className="admin-login-header"><div className="admin-login-wordmark"><span aria-hidden="true">E</span><strong>ExamFlow</strong></div><span>Quản trị hệ thống</span></header>
    <div className="admin-login-content"><div className="admin-login-shell">
      <aside className="admin-login-visual" aria-hidden="true">
        <div className="admin-login-visual-heading"><span>EXAMFLOW</span><p>Không gian quản trị khảo thí</p></div>
        <div className="admin-login-art">
          <div className="admin-login-paper admin-login-paper-back" />
          <div className="admin-login-paper">
            <div className="admin-login-paper-heading"><FileText size={23} /><span>Quản lý kỳ thi<small>Học phần · Đề thi · Ca thi</small></span></div>
            <div className="admin-login-paper-rule" />
            {[0, 1, 2].map(item => <div className="admin-login-paper-row" key={item}><span><Check size={14} /></span><div><i /><i /></div></div>)}
            <div className="admin-login-paper-bottom"><span /><span /><span /></div>
          </div>
          <div className="admin-login-art-badge"><CalendarDays size={21} /></div>
          <div className="admin-login-art-book"><BookOpen size={23} /></div>
        </div>
        <div className="admin-login-visual-caption"><LockKeyhole size={15} /><span>Truy cập dành cho quản trị viên</span></div>
      </aside>
      <div className="admin-login-form-column"><section className="admin-login-card" aria-labelledby="admin-login-title">
      <h1 id="admin-login-title">Đăng nhập quản trị</h1><p className="admin-login-description">Nhập tài khoản quản trị của bạn để tiếp tục.</p>
      <form onSubmit={submit} aria-busy={busy}>
        {error && <div role="alert" className="admin-login-error"><AlertCircle size={17} /><span>{error}</span></div>}
        <label htmlFor="admin-username">Tên đăng nhập hoặc email</label><input id="admin-username" autoComplete="username" autoCapitalize="none" spellCheck={false} required disabled={busy} value={username} onChange={event => setUsername(event.target.value)} />
        <label htmlFor="admin-password">Mật khẩu</label><div className="admin-login-password"><input id="admin-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required disabled={busy} value={password} onChange={event => setPassword(event.target.value)} onKeyUp={event => setCapsLock(event.getModifierState('CapsLock'))} onKeyDown={event => setCapsLock(event.getModifierState('CapsLock'))} onBlur={() => setCapsLock(false)} /><button type="button" disabled={busy} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} onClick={() => setShowPassword(previous => !previous)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
        {capsLock && <p className="admin-login-caps" role="status">Caps Lock đang bật.</p>}
        <button disabled={busy} className="admin-login-submit">{busy && <Loader2 size={17} className="animate-spin" />}{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form><div className="admin-login-card-footer"><Link to={ROUTES.LOGIN}><ArrowLeft size={14} />Đăng nhập sinh viên / giảng viên</Link></div>
    </section><p className="admin-login-support">Chưa có tài khoản hoặc cần cấp lại mật khẩu?<br />Liên hệ quản trị viên của đơn vị.</p></div></div></div>
    <footer className="admin-login-footer">Hệ thống khảo thí trực tuyến</footer>
  </main>;
}
