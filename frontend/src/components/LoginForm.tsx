import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  User,
  Lock,
} from 'lucide-react';

import type { UserRole } from '../types';
import { RoleToggle } from './RoleToggle';
import { RegisterModal } from './RegisterModal';

import keycloak from '../services/keycloak';
import {
  loginWithCredentials,
} from '../services/authService';

interface LoginFormProps {
  onLoginSuccess?: (
    role: UserRole,
    email: string
  ) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onLoginSuccess,
}) => {
  const [role, setRole] =
    useState<UserRole>('student');

  const [emailInput, setEmailInput] =
    useState('');

  const [passwordInput, setPasswordInput] =
    useState('');

  const [isLoading, setIsLoading] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState('');

  const [
    showRegisterModal,
    setShowRegisterModal,
  ] = useState(false);

  /**
   * =========================================================
   * SOCIAL LOGIN CALLBACK
   * =========================================================
   *
   * main.tsx đã gọi keycloak.init() trước khi render React.
   *
   * Nếu Google/Microsoft login thành công,
   * Keycloak redirect về /login.
   *
   * Lúc đó:
   *
   * keycloak.authenticated === true
   *
   * -> chuyển thẳng sang Dashboard.
   */
  useEffect(() => {
    if (!keycloak.authenticated) {
      return;
    }

    const userEmail =
      keycloak.tokenParsed?.email ??
      keycloak.tokenParsed?.preferred_username ??
      '';

    onLoginSuccess?.(
      role,
      userEmail
    );
  }, [onLoginSuccess, role]);

  /**
   * =========================================================
   * EMAIL / PASSWORD LOGIN
   * =========================================================
   */
  const handleLogin = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setIsLoading(true);
    setErrorMessage('');

    try {
      const normalizedEmail =
        emailInput
          .trim()
          .toLowerCase();

      await loginWithCredentials(
        normalizedEmail,
        passwordInput
      );

      /**
       * Login thành công.
       *
       * LoginPage sẽ navigate sang Dashboard.
       */
      onLoginSuccess?.(
        role,
        normalizedEmail
      );
    } catch (error: unknown) {
      console.error(
        'Login failed:',
        error
      );

      setErrorMessage(
        'Email hoặc mật khẩu không chính xác.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * =========================================================
   * GOOGLE / MICROSOFT LOGIN
   * =========================================================
   */
  const handleSocialLogin = async (
    provider: 'google' | 'microsoft'
  ) => {
    setErrorMessage('');

    try {
      setIsLoading(true);

      await keycloak.login({
        idpHint: provider,

        /**
         * Sau khi authenticate xong,
         * Keycloak redirect về LoginPage.
         *
         * main.tsx init Keycloak.
         * useEffect phía trên sẽ phát hiện
         * authenticated === true và đưa user
         * sang Dashboard.
         */
        redirectUri:
          `${window.location.origin}/login`,
      });
    } catch (error) {
      console.error(
        `${provider} login failed:`,
        error
      );

      setErrorMessage(
        provider === 'google'
          ? 'Không thể đăng nhập bằng Google. Vui lòng thử lại.'
          : 'Không thể đăng nhập bằng Microsoft. Vui lòng thử lại.'
      );

      setIsLoading(false);
    }
  };

  /**
   * =========================================================
   * ROLE
   * =========================================================
   */
  const handleRoleChange = (
    newRole: UserRole
  ) => {
    setRole(newRole);
  };

  return (
    <div
      className="mx-auto w-full max-w-[420px]"
      id="login-card-container"
    >
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-slate-950">
          Đăng nhập
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Sử dụng tài khoản của bạn để truy cập hệ thống thi trực tuyến.
        </p>
      </div>

      {/* Role */}
      <div className="mb-5">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Vai trò
        </label>

        <RoleToggle
          selectedRole={role}
          onChange={handleRoleChange}
        />
      </div>

      {/* Login form */}
      <form
        onSubmit={handleLogin}
        className="space-y-4"
      >
        {errorMessage && (
          <motion.div
            initial={{
              opacity: 0,
              y: -4,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600"
          >
            {errorMessage}
          </motion.div>
        )}

        {/* Email */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </label>

          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              type="email"
              required
              disabled={isLoading}
              value={emailInput}
              onChange={(e) =>
                setEmailInput(
                  e.target.value
                )
              }
              placeholder="Nhập email..."
              autoComplete="email"
              className="h-11 w-full rounded-lg border border-slate-300 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Mật khẩu
          </label>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              type="password"
              required
              disabled={isLoading}
              value={passwordInput}
              onChange={(e) =>
                setPasswordInput(
                  e.target.value
                )
              }
              placeholder="••••••••"
              autoComplete="current-password"
              className="h-11 w-full rounded-lg border border-slate-300 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
            />
          </div>
        </div>

        {/* Login button */}
        <button
          id="login-submit-button"
          type="submit"
          disabled={isLoading}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            backgroundColor:
              'var(--primary)',
            color:
              'var(--primary-text)',
          }}
        >
          {isLoading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />

              Đang đăng nhập...
            </>
          ) : (
            <>
              Đăng nhập

              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />

        <span className="text-xs text-slate-400">
          hoặc tiếp tục với
        </span>

        <div className="h-px flex-1 bg-slate-200" />
      </div>

      {/* Social login */}
      <div
        className="grid grid-cols-2 gap-3"
        id="social-sso-container"
      >
        {/* Google */}
        <button
          id="sso-google-btn"
          type="button"
          disabled={isLoading}
          onClick={() =>
            handleSocialLogin(
              'google'
            )
          }
          className="flex h-11 items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg
            className="h-4 w-4 shrink-0"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
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

          Google
        </button>

        {/* Microsoft */}
        <button
          id="sso-microsoft-btn"
          type="button"
          disabled={isLoading}
          onClick={() =>
            handleSocialLogin(
              'microsoft'
            )
          }
          className="flex h-11 items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg
            className="h-4 w-4 shrink-0"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              fill="#F25022"
              d="M1 1h10v10H1z"
            />

            <path
              fill="#00A4EF"
              d="M1 13h10v10H1z"
            />

            <path
              fill="#7FBA00"
              d="M13 1h10v10H13z"
            />

            <path
              fill="#FFB900"
              d="M13 13h10v10H13z"
            />
          </svg>

          Microsoft
        </button>
      </div>

      {/* Register */}
      <p className="mt-6 text-center text-sm text-slate-500">
        Chưa có tài khoản?{' '}

        <button
          id="register-link-btn"
          type="button"
          onClick={() =>
            setShowRegisterModal(
              true
            )
          }
          className="font-medium transition hover:opacity-75"
          style={{
            color:
              'var(--primary)',
          }}
        >
          Đăng ký tài khoản
        </button>
      </p>

      <RegisterModal
        isOpen={showRegisterModal}
        onClose={() =>
          setShowRegisterModal(
            false
          )
        }
        onSwitchToLogin={() =>
          setShowRegisterModal(
            false
          )
        }
      />
    </div>
  );
};