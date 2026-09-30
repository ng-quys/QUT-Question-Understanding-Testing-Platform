import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeroSlider } from './HeroSlider';
import { LoginForm } from './LoginForm';
import { HelpCircle, Globe, GraduationCap, LayoutDashboard } from 'lucide-react';
import type { UserRole } from '../types';
import { ROUTES } from '../constants/routes';

export const LoginPage: React.FC = () => {
  const [lang, setLang] = useState<'vi' | 'en'>('vi');
  const navigate = useNavigate();

  const handleLoginSuccess = (role: UserRole, _email: string) => {
    navigate(role === 'student' ? ROUTES.STUDENT : ROUTES.DASHBOARD);
  };

  return (
    <main className="min-h-screen w-full app-bg-main flex flex-col justify-between selection:bg-indigo-500 selection:text-white relative overflow-x-hidden">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full blur-3xl opacity-60"
          style={{ backgroundColor: 'var(--primary-light)' }}
        />
        <div
          className="absolute top-1/2 -left-40 w-[500px] h-[500px] rounded-full blur-3xl opacity-50"
          style={{ backgroundColor: 'var(--accent-bg-subtle)' }}
        />
        <div
          className="absolute -bottom-40 right-1/4 w-[550px] h-[550px] rounded-full blur-3xl opacity-40"
          style={{ backgroundColor: 'var(--primary-light)' }}
        />
      </div>

      {/* Top Navbar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-2 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div
            className="w-9 h-9 rounded-xl text-white flex items-center justify-center shadow-md"
            style={{ backgroundColor: 'var(--primary)', boxShadow: '0 4px 12px var(--primary-glow)' }}
          >
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-extrabold text-xl app-text-main tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">
              ExamFlow
            </span>
            <span
              className="text-xs font-bold px-1.5 py-0.5 rounded-md text-white tracking-wide"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              AI
            </span>
          </div>
        </div>

        {/* Top utility links */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-600 font-medium">
          {/* Quick preview button to /dashboard */}
          <button
            type="button"
            onClick={() => navigate(ROUTES.DASHBOARD)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold shadow-xs transition-all cursor-pointer"
            style={{
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary)',
              border: '1px solid var(--primary-border)',
            }}
            title="Xem trước Dashboard Giảng viên"
          >
            <LayoutDashboard className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
            <span>Dashboard Giảng viên</span>
          </button>

          <button
            type="button"
            onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/80 hover:bg-white border border-slate-200 shadow-sm transition-all cursor-pointer"
            title="Đổi ngôn ngữ"
          >
            <Globe className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
            <span>{lang === 'vi' ? 'Tiếng Việt (VN)' : 'English (EN)'}</span>
          </button>
          <a
            href="#help"
            onClick={(e) => {
              e.preventDefault();
              alert('Trung tâm trợ giúp: Vui lòng liên hệ phòng Khảo thí & Đảm bảo chất lượng hoặc email support@examflow.edu.vn');
            }}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/80 hover:bg-white border border-slate-200 shadow-sm transition-all text-slate-700"
          >
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>Trợ giúp</span>
          </a>
        </div>
      </header>

      {/* Main Split Layout Container */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 my-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* LEFT COLUMN: Animated Hero Slider */}
          <section className="lg:col-span-7 xl:col-span-7 flex flex-col justify-center order-2 lg:order-1">
            <HeroSlider />
          </section>

          {/* RIGHT COLUMN: Login Form Area */}
          <section className="lg:col-span-5 xl:col-span-5 flex flex-col justify-center order-1 lg:order-2">
            <LoginForm onLoginSuccess={handleLoginSuccess} />
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-xs text-slate-400">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-200/60 pt-4">
          <p>© 2026 ExamFlow AI - Hệ thống Khảo thí & Đánh giá Trực tuyến Thông minh.</p>
          <div className="flex items-center gap-4 text-slate-500">
            <a href="#privacy" onClick={(e) => e.preventDefault()} className="hover:text-indigo-600 transition-colors">
              Chính sách bảo mật
            </a>
            <span>•</span>
            <a href="#terms" onClick={(e) => e.preventDefault()} className="hover:text-indigo-600 transition-colors">
              Điều khoản sử dụng
            </a>
            <span>•</span>
            <a href="#guide" onClick={(e) => e.preventDefault()} className="hover:text-indigo-600 transition-colors">
              Hướng dẫn thi
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
};
