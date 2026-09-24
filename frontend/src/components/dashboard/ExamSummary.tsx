import React from 'react';
import { CheckCircle2, Clock, ArrowRight } from 'lucide-react';
import type{ DashboardSummaryMetrics } from '../../data/dashboardMockData';

interface ExamSummaryProps {
  summary: DashboardSummaryMetrics;
  onViewResults: () => void;
  onViewSessions: () => void;
}

export const ExamSummary: React.FC<ExamSummaryProps> = ({
  summary,
  onViewResults,
  onViewSessions,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
      {/* Block 1: Đã hoàn thành */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 sm:p-4 min-h-[96px] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Đã hoàn thành</div>
            <div className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">
              {summary.completedExams}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onViewResults}
          className="text-xs font-medium flex items-center gap-1 cursor-pointer hover:underline"
          style={{ color: 'var(--primary)' }}
        >
          Xem kết quả
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Block 2: Đang diễn ra */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 sm:p-4 min-h-[96px] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
            <Clock className="w-4 h-4" style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Đang diễn ra</div>
            <div className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">
              {summary.activeSessions}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onViewSessions}
          className="text-xs font-medium flex items-center gap-1 cursor-pointer hover:underline"
          style={{ color: 'var(--primary)' }}
        >
          Xem ca thi
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
