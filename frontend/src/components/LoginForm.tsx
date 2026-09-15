import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Check, AlertCircle, Sparkles, ShieldCheck } from 'lucide-react';
import type { UserRole, LoginFormData, FormErrors } from '../types';
import { RoleToggle } from './RoleToggle';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { RegisterModal } from './RegisterModal';

interface LoginFormProps {
  onLoginSuccess?: (role: UserRole, email: string) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const [role, setRole] = useState<UserRole>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);

  // Modals
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole);
    setErrors({});
    // Adapt default sample email for testing convenience if input is empty
    if (!email || email.includes('student') || email.includes('faculty') || email.includes('giangvien') || email.includes('sinhvien')) {
      if (newRole === 'student') {
        setEmail('student@university.edu.vn');
        setPassword('Matkhau123@');
      } else {
        setEmail('faculty@university.edu.vn');
        setPassword('Giangvien123@');
      }
    }
  };

  const handleQuickDemoFill = (selectedRole: UserRole) => {
    setRole(selectedRole);
    if (selectedRole === 'student') {
      setEmail('student@university.edu.vn');
      setPassword('Matkhau123@');
    } else {
      setEmail('faculty@university.edu.vn');
      setPassword('Giangvien123@');
    }
    setErrors({});
  };

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!email.trim()) {
      errs.email = 'Vui lòng nhập địa chỉ email';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'Định dạng email không hợp lệ';
    }

    if (!password) {
      errs.password = 'Vui lòng nhập mật khẩu';
    } else if (password.length < 6) {
      errs.password = 'Mật khẩu phải có ít nhất 6 ký tự';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    // Simulate login API latency
    setTimeout(() => {
      setIsLoading(false);
      setLoginSuccess(true);
      if (onLoginSuccess) {
        setTimeout(() => {
          onLoginSuccess(role, email);
        }, 500);
      }
    }, 700);
  };

  const handleSocialLogin = (provider: 'Google' | 'Microsoft') => {
    setIsLoading(true);
    const userEmail = role === 'student' ? `sinhvien.${provider.toLowerCase()}@edu.vn` : `giangvien.${provider.toLowerCase()}@edu.vn`;
    setTimeout(() => {
      setIsLoading(false);
      setEmail(userEmail);
      setPassword('••••••••••••');
      setLoginSuccess(true);
      if (onLoginSuccess) {
        setTimeout(() => {
          onLoginSuccess(role, userEmail);
        }, 500);
      }
    }, 500);
  };

  return (
    <div className="w-full max-w-md mx-auto relative" id="login-card-container">
      {/* Top micro badges */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Cổng xác thực sinh viên & giảng viên</span>
        </div>
        <div
          className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
          style={{
            color: 'var(--primary)',
            backgroundColor: 'var(--primary-light)',
            border: '1px solid var(--primary-border)',
          }}
        >
          <ShieldCheck className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
          <span>SSL 256-bit</span>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="app-bg-card rounded-3xl p-6 sm:p-9 shadow-xl border app-border"
      >
        {/* Header Title & Subtitle */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold app-text-main tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">
            Đăng nhập
          </h1>
          <p className="app-text-muted mt-1.5 text-sm leading-relaxed">
            Truy cập hệ thống quản lý thi trắc nghiệm trực tuyến
          </p>
        </div>

        {/* Role Toggle Switch */}
        <div className="mb-6">
          <label className="block text-xs font-bold app-text-main uppercase tracking-wider mb-2">
            Vai trò của bạn:
          </label>
          <RoleToggle selectedRole={role} onChange={handleRoleChange} />
        </div>

        {/* Login Success Alert State */}
        <AnimatePresence>
          {loginSuccess && (
            <motion.div
              initial={{ opacity: 0, height: 0, mb: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
              exit={{ opacity: 0, height: 0 }}
              className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-emerald-800 text-xs"
            >
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold">Đăng nhập thành công!</div>
                <div className="text-emerald-700 mt-0.5">
                  Đang chuyển hướng đến bảng điều khiển{' '}
                  <span className="font-semibold underline">
                    {role === 'student' ? 'Làm bài thi của Sinh viên' : 'Quản lý Đề & Chấm điểm Giảng viên'}
                  </span>
                  ...
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Email input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="login-email-input"
                className="block text-xs font-bold app-text-main uppercase tracking-wider"
              >
                Địa chỉ Email
              </label>
              <span className="text-[11px] app-text-muted">
                {role === 'student' ? 'Mã SV / Email trường' : 'Email công vụ'}
              </span>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                id="login-email-input"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors({ ...errors, email: undefined });
                }}
                placeholder={role === 'student' ? 'sv2024@university.edu.vn' : 'giangvien@university.edu.vn'}
                className={`w-full pl-10 pr-4 py-3 text-sm rounded-xl border bg-white app-text-main placeholder:text-slate-400 shadow-sm focus:outline-none transition-all duration-200 ${
                  errors.email
                    ? 'border-rose-400 focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500'
                    : 'border-slate-200 app-input-focus'
                }`}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                autoComplete="email"
              />
            </div>
            {errors.email && (
              <p id="email-error" className="text-xs text-rose-500 font-medium flex items-center gap-1 mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {errors.email}
              </p>
            )}
          </div>

          {/* Password input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="login-password-input"
                className="block text-xs font-bold app-text-main uppercase tracking-wider"
              >
                Mật khẩu
              </label>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="login-password-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors({ ...errors, password: undefined });
                }}
                placeholder="Nhập mật khẩu của bạn"
                className={`w-full pl-10 pr-11 py-3 text-sm rounded-xl border bg-white app-text-main placeholder:text-slate-400 shadow-sm focus:outline-none transition-all duration-200 ${
                  errors.password
                    ? 'border-rose-400 focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500'
                    : 'border-slate-200 app-input-focus'
                }`}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && (
              <p id="password-error" className="text-xs text-rose-500 font-medium flex items-center gap-1 mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {errors.password}
              </p>
            )}
          </div>

          {/* Remember me & Forgot Password */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 cursor-pointer transition-colors"
                style={{ accentColor: 'var(--primary)' }}
                id="remember-me-checkbox"
              />
              <span className="text-xs app-text-muted font-medium">Ghi nhớ đăng nhập</span>
            </label>

            <button
              type="button"
              onClick={() => setShowForgotModal(true)}
              className="text-xs font-semibold hover:opacity-80 transition-opacity"
              style={{ color: 'var(--primary)' }}
              id="forgot-password-link"
            >
              Quên mật khẩu?
            </button>
          </div>

          {/* Primary Login Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3.5 px-4 rounded-xl active:scale-[0.99] font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-text)',
              boxShadow: '0 4px 16px var(--primary-glow)',
            }}
            id="login-submit-button"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Đang xác thực...</span>
              </div>
            ) : (
              <>
                <span>Đăng nhập</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="app-bg-card px-3 text-slate-400 font-bold tracking-wider text-[10px]">
              Hoặc tiếp tục với
            </span>
          </div>
        </div>

        {/* Social SSO Buttons */}
        <div className="grid grid-cols-2 gap-3" id="social-sso-container">
          <button
            type="button"
            onClick={() => handleSocialLogin('Google')}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-xs font-semibold text-slate-700 shadow-sm"
            id="sso-google-btn"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Google</span>
          </button>

          <button
            type="button"
            onClick={() => handleSocialLogin('Microsoft')}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-xs font-semibold text-slate-700 shadow-sm"
            id="sso-microsoft-btn"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#F25022" d="M1 1h10v10H1z" />
              <path fill="#00A4EF" d="M1 13h10v10H1z" />
              <path fill="#7FBA00" d="M13 1h10v10H13z" />
              <path fill="#FFB900" d="M13 13h10v10H13z" />
            </svg>
            <span>Microsoft</span>
          </button>
        </div>

        {/* Footer Register Link */}
        <div className="mt-6 pt-5 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-500">
            Chưa có tài khoản?{' '}
            <button
              type="button"
              onClick={() => setShowRegisterModal(true)}
              className="font-bold underline underline-offset-2 hover:opacity-80 transition-opacity"
              style={{ color: 'var(--primary)' }}
              id="register-link-btn"
            >
              Đăng ký
            </button>
          </p>
        </div>
      </motion.div>

      {/* Quick Demo Credentials Card for Instant Testing */}
      <div className="mt-4 p-3 app-bg-card backdrop-blur-sm rounded-2xl border app-border text-xs flex items-center justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
          <span className="font-semibold app-text-main">Tài khoản thử nghiệm:</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleQuickDemoFill('student')}
            className="px-2.5 py-1 rounded-lg font-semibold transition-colors text-[11px]"
            style={{
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary)',
              border: '1px solid var(--primary-border)',
            }}
          >
            Sinh viên mẫu
          </button>
          <button
            type="button"
            onClick={() => handleQuickDemoFill('faculty')}
            className="px-2.5 py-1 rounded-lg font-semibold transition-colors text-[11px]"
            style={{
              backgroundColor: 'var(--accent-bg-subtle)',
              color: 'var(--accent-text)',
              border: '1px solid var(--accent-border)',
            }}
          >
            Giảng viên mẫu
          </button>
        </div>
      </div>

      {/* Modals */}
      <ForgotPasswordModal
        isOpen={showForgotModal}
        onClose={() => setShowForgotModal(false)}
        initialEmail={email}
      />
      <RegisterModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        onSwitchToLogin={() => setShowRegisterModal(false)}
      />
    </div>
  );
};
