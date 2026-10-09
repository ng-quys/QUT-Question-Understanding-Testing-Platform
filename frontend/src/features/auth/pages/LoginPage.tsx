import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  HelpCircle,
} from 'lucide-react';

import { LoginForm } from '../components/LoginForm';

import type { UserRole } from '../../../types';
import { ROUTES } from '../../../app/routes';
import {
  getToken,
  saveAuthSession,
} from '../services/authService';

export const LoginPage: React.FC = () => {
  const [lang, setLang] =
    useState<'vi' | 'en'>('vi');

  const navigate = useNavigate();

  /**
   * LoginForm gọi function này sau khi
   * Email/Password login thành công.
   */
  const handleLoginSuccess = (
    role: UserRole,
    email: string
  ) => {
    const token = getToken();

    if (!token) {
      console.error(
        'Login succeeded but access token was not found.'
      );
      return;
    }

    /**
     * StudentPortalPage hiện đang đọc examflow_auth.
     *
     * Vì vậy sau khi login thành công,
     * lưu session để StudentPortalPage có thể
     * nhận biết user hiện tại.
     */
    saveAuthSession(
      {
        token,
        username: email,
        email,
        fullName: email,
        role,
      },
      true
    );

    if (role === 'student') {
      navigate(ROUTES.STUDENT, {
        replace: true,
      });

      return;
    }

    navigate(ROUTES.DASHBOARD, {
      replace: true,
    });
  };

  return (
    <main className="min-h-dvh bg-[#f4f6fa] text-slate-900">
      {/* Minimal top bar */}
      <header className="border-b border-[var(--border-color)] bg-white">
        <div className="mx-auto flex h-14 w-full max-w-[1160px] items-center justify-between px-5 sm:px-8 lg:px-10">

          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-white">
              <GraduationCap className="h-[17px] w-[17px]" />
            </div>

            <span className="text-[15px] font-semibold tracking-tight text-slate-950">
              ExamFlow
            </span>
          </div>

          <div className="flex items-center gap-1 text-sm text-slate-500">

            <button
              type="button"
              onClick={() =>
                setLang(
                  lang === 'vi'
                    ? 'en'
                    : 'vi'
                )
              }
              className="rounded-md px-3 py-2 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              {lang === 'vi'
                ? 'VI'
                : 'EN'}
            </button>

            <span className="h-4 w-px bg-slate-200" />

            <button
              type="button"
              onClick={() =>
                alert(
                  'Trung tâm trợ giúp: Vui lòng liên hệ phòng Khảo thí & Đảm bảo chất lượng hoặc email support@examflow.edu.vn'
                )
              }
              className="flex items-center gap-1.5 rounded-md px-3 py-2 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <HelpCircle className="h-4 w-4" />

              <span className="hidden sm:inline">
                Trợ giúp
              </span>
            </button>

          </div>
        </div>
      </header>

      {/* Main login layout */}
      <div className="mx-auto w-full max-w-[1160px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">

        <div className="grid grid-cols-1 overflow-hidden rounded-[24px] border border-[#dce4ef] bg-[#f9fbff] shadow-[0_16px_45px_rgba(15,35,65,0.07)] lg:min-h-[540px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">

          {/* Minimal static banner — no slider or autoplay */}
          <section className="relative hidden overflow-hidden bg-[#0D1B2A] lg:flex lg:flex-col lg:justify-between p-8 xl:p-10">
            <div className="pointer-events-none absolute -right-32 -top-32 h-[310px] w-[310px] rounded-full border border-white/15" />
            <div className="pointer-events-none absolute -right-16 -top-16 h-[230px] w-[230px] rounded-full border border-white/10" />
            <div className="relative flex items-center gap-3 text-sm font-medium tracking-wide text-white/80">
              <GraduationCap className="h-5 w-5" />
              <span>EXAMFLOW</span>
            </div>
            <div className="relative max-w-[490px]">
              <div className="mb-5 h-1 w-10 rounded-full bg-[var(--accent)]" />
              <h1 className="text-[29px] font-semibold leading-tight tracking-tight text-white xl:text-[32px]">
                Khảo thí đơn giản.<br />Đánh giá hiệu quả.
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-slate-200/85">
                Một nền tảng cho giảng viên và sinh viên.
              </p>
            </div>
            <span className="relative text-xs tracking-wide text-white/45">HỆ THỐNG KHẢO THÍ TRỰC TUYẾN</span>
          </section>

          {/* Login */}
          <section className="flex items-center justify-center bg-[#f9fbff] px-6 py-7 sm:px-8 lg:px-9 lg:py-6 xl:px-10">

            <div className="w-full max-w-[400px]">

              <div className="mb-9 lg:hidden">

                <p className="text-sm font-medium text-slate-500">
                  ExamFlow
                </p>

                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  Hệ thống khảo thí trực tuyến
                </h1>

              </div>

              <LoginForm
                onLoginSuccess={
                  handleLoginSuccess
                }
              />

            </div>
          </section>

        </div>
      </div>

      <footer className="mx-auto flex w-full max-w-[1160px] flex-col items-center justify-between gap-2 px-5 pb-5 text-xs text-slate-400 sm:flex-row sm:px-8 lg:px-10">

        <p>
          © 2026 ExamFlow. Hệ thống Khảo thí & Đánh giá Trực tuyến.
        </p>

        <div className="flex items-center gap-5">

          <a
            href="#privacy"
            onClick={(e) =>
              e.preventDefault()
            }
            className="transition-colors hover:text-slate-700"
          >
            Bảo mật
          </a>

          <a
            href="#terms"
            onClick={(e) =>
              e.preventDefault()
            }
            className="transition-colors hover:text-slate-700"
          >
            Điều khoản
          </a>

          <a
            href="#guide"
            onClick={(e) =>
              e.preventDefault()
            }
            className="transition-colors hover:text-slate-700"
          >
            Hướng dẫn
          </a>

        </div>

      </footer>
    </main>
  );
};