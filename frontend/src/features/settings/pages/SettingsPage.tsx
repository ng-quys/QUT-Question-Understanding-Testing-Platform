import React, { useEffect, useState } from 'react';
import {
  User,
  Bell,
  Shield,
  Save,
  Check,
  Building,
  Mail,
  GraduationCap,
  Sliders,
  Sparkles,
} from 'lucide-react';

import {useTeacherProfile} from '../../profile-teacher/hooks/useTeacherProfile';
import {updateTeacherProfile} from '../../profile-teacher/services/teacherProfileService';

interface SettingsPageProps {
  onShowToast: (msg: string) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onShowToast }) => {
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'exam' | 'notifications'>('general');
  const {profile, error:loadError} = useTeacherProfile();
  const [fullName, setFullName] = useState('');
  const email = profile?.email || '';
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    if (profile) {
      setFullName(profile.name || '');
      setDepartment(profile.department || '');
    }
  }, [profile]);
  const [defaultDuration, setDefaultDuration] = useState(60);
  const [autoShuffle, setAutoShuffle] = useState(true);
  const [instantScore, setInstantScore] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeSubTab !== 'general') {
      onShowToast('Đã lưu cấu hình hệ thống thành công!');
      return;
    }
    if (!profile || busy || !fullName.trim()) return;
    setBusy(true);
    setSaveError('');
    try {
      await updateTeacherProfile({name: fullName, department});
      onShowToast('Đã lưu thông tin tài khoản thành công!');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Không lưu được thông tin tài khoản.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 font-sans tracking-tight">
          Cài đặt hệ thống
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Quản lý thông tin tài khoản giảng viên và thiết lập mặc định cho các ca thi.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveSubTab('general')}
          className={`pb-2.5 px-3 border-b-2 cursor-pointer transition-colors ${
            activeSubTab === 'general'
              ? 'border-[var(--primary)] text-[var(--primary)] font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Thông tin tài khoản
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('exam')}
          className={`pb-2.5 px-3 border-b-2 cursor-pointer transition-colors ${
            activeSubTab === 'exam'
              ? 'border-[var(--primary)] text-[var(--primary)] font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Cấu hình Ca thi & Đề thi
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('notifications')}
          className={`pb-2.5 px-3 border-b-2 cursor-pointer transition-colors ${
            activeSubTab === 'notifications'
              ? 'border-[var(--primary)] text-[var(--primary)] font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Thông báo
        </button>
      </div>

      {/* Form Content */}
      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-5 max-w-2xl">
        {activeSubTab === 'general' && (
          <div className="space-y-4">
            {(loadError || saveError) && <p role="alert" className="text-xs text-red-700">{saveError || loadError}</p>}
            {!profile && !loadError && <p role="status" className="text-xs text-slate-500">Đang tải hồ sơ...</p>}
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base shadow-xs"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                {profile?.name?.trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase() || <User className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">{fullName}</h3>
                <p className="text-xs text-slate-500">{profile?.role || 'Chưa có dữ liệu'}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Họ và tên giảng viên
                </label>
                <input
                  type="text"
                  required
                  maxLength={150}
                  disabled={!profile || busy}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email công vụ
                </label>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Khoa / Bộ môn
                </label>
                <input
                  type="text"
                  maxLength={150}
                  disabled={!profile || busy}
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-[var(--primary)]"
                />
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'exam' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Thời lượng ca thi mặc định (phút)
              </label>
              <select
                value={defaultDuration}
                onChange={(e) => setDefaultDuration(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-[var(--primary)]"
              >
                <option value={15}>15 phút</option>
                <option value={30}>30 phút</option>
                <option value={45}>45 phút</option>
                <option value={60}>60 phút</option>
                <option value={90}>90 phút</option>
              </select>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoShuffle}
                  onChange={(e) => setAutoShuffle(e.target.checked)}
                  className="rounded text-[var(--primary)] focus:ring-0 cursor-pointer"
                />
                <span>Mặc định tự động xáo trộn câu hỏi và đáp án khi sinh viên làm bài</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={instantScore}
                  onChange={(e) => setInstantScore(e.target.checked)}
                  className="rounded text-[var(--primary)] focus:ring-0 cursor-pointer"
                />
                <span>Cho phép thí sinh xem điểm ngay sau khi bấm nộp bài</span>
              </label>
            </div>
          </div>
        )}

        {activeSubTab === 'notifications' && (
          <div className="space-y-3 text-xs text-slate-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={emailAlerts}
                onChange={(e) => setEmailAlerts(e.target.checked)}
                className="rounded text-[var(--primary)] focus:ring-0 cursor-pointer"
              />
              <span>Gửi thông báo qua email khi ca thi kết thúc hoặc đạt 100% bài nộp</span>
            </label>
            <p className="text-[11px] text-slate-400">
              Hệ thống sẽ tổng hợp danh sách điểm và file đính kèm gửi về hòm thư công vụ của bạn.
            </p>
          </div>
        )}

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
          <button
            type="submit"
            disabled={busy || (activeSubTab === 'general' && (!profile || !fullName.trim()))}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white shadow-xs hover:opacity-95 transition-all cursor-pointer"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <Save className="w-4 h-4" />
            <span>{busy ? 'Đang lưu...' : 'Lưu cài đặt'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
