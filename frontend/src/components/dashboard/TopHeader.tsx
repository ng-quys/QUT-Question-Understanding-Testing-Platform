import React, { useState } from 'react';
import {
  Search,
  Bell,
  Menu,
  ChevronDown,
  Sparkles,
  CheckCircle2,
  Calendar,
  LogOut,
  User,
  HelpCircle,
} from 'lucide-react';
import { LECTURER_PROFILE, NOTIFICATIONS_DATA } from '../../data/mockDashboardData';
import type{ DashboardNavTab } from '../../types';

interface TopHeaderProps {
  activeTab: DashboardNavTab;
  onMobileMenuToggle: () => void;
  onLogout: () => void;
  onOpenAIGenerator: () => void;
}

const TAB_TITLES: Record<DashboardNavTab, string> = {
  overview: 'Tổng quan',
  courses: 'Quản lý học phần',
  'question-bank': 'Danh sách câu hỏi',
  'new-question': 'Tạo câu hỏi mới',
  'ai-generator': 'AI sinh câu hỏi',
  'quick-exam': 'Tạo đề nhanh',
  exams: 'Quản lý đề thi',
  'exam-sessions': 'Ca thi trực tuyến',
  settings: 'Cài đặt',
};

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  onMobileMenuToggle,
  onLogout,
  onOpenAIGenerator,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const unreadCount = NOTIFICATIONS_DATA.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-20 h-16 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between transition-all">
      {/* Left: Mobile Menu Trigger & Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileMenuToggle}
          className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          aria-label="Mở menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 font-['Space_Grotesk'] tracking-tight">
              {TAB_TITLES[activeTab]}
            </h1>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200/60">
              {LECTURER_PROFILE.currentSemester}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Search, Notifications, Profile Pill */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Compact Search Bar */}
        <div className="relative hidden md:block w-64 lg:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm đề thi, câu hỏi, sinh viên..."
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200/80 focus:bg-white focus:outline-none focus:border-[var(--primary)] text-slate-800 placeholder-slate-400 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Notifications Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserDropdown(false);
            }}
            className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Thông báo"
          >
            <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
            {unreadCount > 0 && (
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-white"
                style={{ backgroundColor: 'var(--primary)' }}
              />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-88 bg-white rounded-2xl shadow-xl border border-slate-200/80 p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 mb-2">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Thông báo ({unreadCount} mới)
                </span>
                <span
                  className="text-[11px] cursor-pointer hover:underline font-semibold"
                  style={{ color: 'var(--primary)' }}
                >
                  Đã đọc tất cả
                </span>
              </div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {NOTIFICATIONS_DATA.map((notif) => (
                  <div
                    key={notif.id}
                    className="p-2.5 rounded-xl text-xs transition-colors cursor-pointer bg-slate-50/70 hover:bg-slate-100/70 border border-slate-100"
                  >
                    <div className="flex items-start gap-2">
                      {notif.type === 'ai' ? (
                        <div
                          className="p-1 rounded-md text-white shrink-0 mt-0.5"
                          style={{ backgroundColor: 'var(--primary)' }}
                        >
                          <Sparkles className="w-3 h-3" />
                        </div>
                      ) : (
                        <div className="p-1 rounded-md bg-emerald-600 text-white shrink-0 mt-0.5">
                          <CheckCircle2 className="w-3 h-3" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 leading-snug">{notif.title}</p>
                        <p className="text-slate-500 text-[11px] mt-0.5">{notif.desc}</p>
                        <span className="text-[10px] text-slate-400 mt-1 block">{notif.time}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Lecturer Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowUserDropdown(!showUserDropdown);
              setShowNotifications(false);
            }}
            className="flex items-center gap-2.5 p-1 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 transition-all cursor-pointer"
          >
            <img
              src={LECTURER_PROFILE.avatarUrl}
              alt={LECTURER_PROFILE.name}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-cover ring-1 ring-slate-200"
              referrerPolicy="no-referrer"
            />
            <div className="hidden sm:block text-left">
              <div className="text-xs font-bold text-slate-900 leading-tight flex items-center gap-1">
                <span>{LECTURER_PROFILE.name}</span>
              </div>
              <div className="text-[10px] text-slate-500 font-medium">
                {LECTURER_PROFILE.role} • CNTT
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {showUserDropdown && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200/80 p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-2 border-b border-slate-100 mb-1">
                <p className="text-xs font-bold text-slate-900">{LECTURER_PROFILE.title}</p>
                <p className="text-[11px] text-slate-500 truncate">{LECTURER_PROFILE.email}</p>
                <span
                  className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: 'var(--primary-light)',
                    color: 'var(--primary)',
                  }}
                >
                  {LECTURER_PROFILE.department}
                </span>
              </div>

              <div className="space-y-0.5">
                <button
                  onClick={() => setShowUserDropdown(false)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>Hồ sơ cá nhân</span>
                </button>
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    onOpenAIGenerator();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  style={{
                    color: 'var(--primary)',
                    backgroundColor: 'var(--primary-light)',
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                  <span>Studio AI Sinh đề</span>
                </button>
                <button
                  onClick={() => setShowUserDropdown(false)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                  <span>Trợ giúp & Tài liệu</span>
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  <span>Đăng xuất (Về Login)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
