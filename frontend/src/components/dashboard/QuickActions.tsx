import React, { useState } from 'react';
import { Plus, FileSpreadsheet, Edit3 } from 'lucide-react';

interface QuickActionsProps {
  onRequestCreateQuestion: () => void;
  onRequestCreateExam: () => void;
  onNavigateToQuestionBank?: () => void;
  onOpenAIGenerator?: () => void;
  onOpenCreateExam?: () => void;
  onOpenCreateSession?: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  onRequestCreateQuestion,
  onRequestCreateExam,
}) => {
  const [hoveredAction, setHoveredAction] = useState<'question' | 'exam' | null>(null);

  return (
    <div className="space-y-2">
      <div className="pb-1 border-b border-slate-200">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          Thao tác nhanh
        </h3>
      </div>

      <div className="space-y-0.5 pt-0.5">
        {/* Action 1: + Tạo câu hỏi */}
        <div
          className="relative"
          onMouseEnter={() => setHoveredAction('question')}
          onMouseLeave={() => setHoveredAction(null)}
        >
          <button
            type="button"
            onClick={onRequestCreateQuestion}
            className="w-full flex items-center gap-2 py-1.5 px-0 text-[13px] sm:text-[14px] font-semibold text-slate-800 hover:text-[var(--primary)] transition-colors text-left cursor-pointer group bg-transparent border-0"
          >
            <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-[var(--primary)] transition-colors shrink-0" />
            <span className="group-hover:underline underline-offset-2">Tạo câu hỏi</span>
          </button>

          {/* Hover Popover for Tạo câu hỏi */}
          {hoveredAction === 'question' && (
            <div className="absolute z-30 left-0 lg:left-auto lg:right-full lg:mr-3 top-full lg:top-0 w-[270px] p-3.5 sm:p-4 bg-white border border-slate-200 rounded-lg shadow-md text-slate-700 animate-in fade-in-50 duration-150 pointer-events-none">
              <div className="text-[14px] font-semibold text-slate-900 mb-1.5 flex items-center gap-2">
                <Edit3 className="w-4 h-4 shrink-0" style={{ color: 'var(--primary)' }} />
                <span>Tạo câu hỏi</span>
              </div>
              <p className="text-[13px] text-slate-600 leading-relaxed">
                Thêm câu hỏi thủ công hoặc sinh câu hỏi bằng AI từ nội dung bài học.
              </p>
            </div>
          )}
        </div>

        {/* Action 2: + Tạo kỳ thi */}
        <div
          className="relative"
          onMouseEnter={() => setHoveredAction('exam')}
          onMouseLeave={() => setHoveredAction(null)}
        >
          <button
            type="button"
            onClick={onRequestCreateExam}
            className="w-full flex items-center gap-2 py-1.5 px-0 text-[13px] sm:text-[14px] font-semibold text-slate-800 hover:text-[var(--primary)] transition-colors text-left cursor-pointer group bg-transparent border-0"
          >
            <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-[var(--primary)] transition-colors shrink-0" />
            <span className="group-hover:underline underline-offset-2">Tạo kỳ thi</span>
          </button>

          {/* Hover Popover for Tạo kỳ thi */}
          {hoveredAction === 'exam' && (
            <div className="absolute z-30 left-0 lg:left-auto lg:right-full lg:mr-3 top-full lg:top-0 w-[270px] p-3.5 sm:p-4 bg-white border border-slate-200 rounded-lg shadow-md text-slate-700 animate-in fade-in-50 duration-150 pointer-events-none">
              <div className="text-[14px] font-semibold text-slate-900 mb-1.5 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 shrink-0" style={{ color: 'var(--primary)' }} />
                <span>Tạo kỳ thi</span>
              </div>
              <p className="text-[13px] text-slate-600 leading-relaxed">
                Tạo đề thi mới hoặc thiết lập một ca thi từ đề đã có.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
