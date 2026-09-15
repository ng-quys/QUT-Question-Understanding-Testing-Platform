import React from 'react';
import { Plus, Sparkles, Calendar, BookCheck } from 'lucide-react';
import { LECTURER_PROFILE } from '../../data/mockDashboardData';

interface WelcomeSectionProps {
  onCreateExam: () => void;
  onOpenAIGenerator: () => void;
}

export const WelcomeSection: React.FC<WelcomeSectionProps> = ({
  onCreateExam,
  onOpenAIGenerator,
}) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold app-text-main tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">
            Chào buổi sáng, {LECTURER_PROFILE.name} 👋
          </h2>
        </div>
        <p className="text-sm app-text-muted mt-1 font-normal">
          Đây là tổng quan hoạt động giảng dạy và thi trực tuyến của bạn.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Secondary AI Action Button */}
        <button
          onClick={onOpenAIGenerator}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer group active:scale-[0.98]"
          style={{
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-text)',
            boxShadow: '0 4px 14px var(--primary-glow)',
          }}
        >
          <Sparkles className="w-4 h-4 text-white/90 group-hover:rotate-12 transition-transform" />
          <span>AI tạo câu hỏi</span>
        </button>

        {/* Primary Action Button */}
        <button
          onClick={onCreateExam}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl app-bg-card border app-border app-text-main text-xs sm:text-sm font-bold shadow-xs hover:bg-slate-50 transition-all cursor-pointer active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" style={{ color: 'var(--primary)' }} />
          <span>Tạo đề thi</span>
        </button>
      </div>
    </div>
  );
};
