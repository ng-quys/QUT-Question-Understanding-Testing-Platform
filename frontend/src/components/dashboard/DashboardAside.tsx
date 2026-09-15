import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { QuickActions } from './QuickActions';
import type{ DashboardQuickStats } from '../../data/dashboardMockData';

interface DashboardAsideProps {
  stats: DashboardQuickStats;
  onRequestCreateQuestion: () => void;
  onRequestCreateExam: () => void;
  onNavigateToQuestionBank: () => void;
  onOpenAIGenerator: () => void;
  onOpenCreateExam: () => void;
  onOpenCreateSession: () => void;
}

export const DashboardAside: React.FC<DashboardAsideProps> = ({
  stats,
  onRequestCreateQuestion,
  onRequestCreateExam,
  onNavigateToQuestionBank,
  onOpenAIGenerator,
  onOpenCreateExam,
  onOpenCreateSession,
}) => {
  return (
    <aside className="w-full lg:w-[240px] xl:w-[260px] flex-shrink-0 space-y-6">
      {/* 1. Thao tác nhanh (Flat ClassMarker Style) */}
      <QuickActions
        onRequestCreateQuestion={onRequestCreateQuestion}
        onRequestCreateExam={onRequestCreateExam}
        onNavigateToQuestionBank={onNavigateToQuestionBank}
        onOpenAIGenerator={onOpenAIGenerator}
        onOpenCreateExam={onOpenCreateExam}
        onOpenCreateSession={onOpenCreateSession}
      />

      {/* 2. Thống kê (Flat Rows, No Card) */}
      <div className="space-y-1">
        <div className="pb-1 border-b border-slate-200">
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Thống kê
          </h3>
        </div>

        <div className="divide-y divide-slate-100 text-[13px]">
          <div className="h-9 flex items-center justify-between">
            <span className="text-slate-600">Câu hỏi</span>
            <span className="font-semibold text-slate-900">
              {stats.questions.toLocaleString()}
            </span>
          </div>
          <div className="h-9 flex items-center justify-between">
            <span className="text-slate-600">Đề thi</span>
            <span className="font-semibold text-slate-900">
              {stats.exams.toLocaleString()}
            </span>
          </div>
          <div className="h-9 flex items-center justify-between">
            <span className="text-slate-600">Ca thi</span>
            <span className="font-semibold text-slate-900">
              {stats.sessions.toLocaleString()}
            </span>
          </div>
          <div className="h-9 flex items-center justify-between">
            <span className="text-slate-600">Lượt nộp bài</span>
            <span className="font-semibold text-slate-900">
              {stats.submissions.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Trợ lý AI (Flat Section, No Card) */}
      <div className="space-y-1.5">
        <div className="pb-1 border-b border-slate-200">
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Trợ lý AI
          </h3>
        </div>

        <div className="pt-1 text-xs text-slate-600 space-y-2">
          <p className="text-[12px] text-slate-600 leading-relaxed">
            Trích xuất câu hỏi từ giáo trình, bài giảng và chuẩn hóa theo ma trận CLO.
          </p>
          <div>
            <button
              type="button"
              onClick={onOpenAIGenerator}
              className="text-[13px] font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
              style={{ color: 'var(--primary)' }}
            >
              <span>Mở AI Generator</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
