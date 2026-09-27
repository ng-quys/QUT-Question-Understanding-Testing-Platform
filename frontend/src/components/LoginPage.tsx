import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  HelpCircle,
} from 'lucide-react';

import { LoginBanner } from './LoginBanner';
import { LoginForm } from './LoginForm';

import type { UserRole } from '../types';
import { ROUTES } from '../constants/routes';

export const LoginPage: React.FC = () => {
  const [lang, setLang] =
    useState<'vi' | 'en'>('vi');

  const navigate = useNavigate();

  /**
   * LoginForm gọi function này sau khi
   * Email/Password login thành công.
   */
  const handleLoginSuccess = (
    _role: UserRole,
    _email: string
  ) => {
    navigate(
      ROUTES.DASHBOARD,
      {
        replace: true,
      }
    );
  };

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-900">
      {/* Minimal top bar */}
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between px-5 sm:px-8 lg:px-10">

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
      <div className="mx-auto w-full max-w-[1400px] px-5 py-6 sm:px-8 lg:px-10 lg:py-8">

        <div className="grid min-h-[calc(100vh-145px)] grid-cols-1 overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.06)] lg:grid-cols-[minmax(0,1.15fr)_minmax(430px,0.85fr)]">

          {/* Static banner */}
          <section className="hidden p-3 lg:block">
            <LoginBanner />
          </section>

          {/* Login */}
          <section className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-12 xl:px-16">

            <div className="w-full max-w-[420px]">

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

      <footer className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-between gap-2 px-5 pb-5 text-xs text-slate-400 sm:flex-row sm:px-8 lg:px-10">

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