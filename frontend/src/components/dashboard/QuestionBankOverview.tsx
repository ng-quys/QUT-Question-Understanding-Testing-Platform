import React from 'react';
import { Database, Sparkles, ArrowRight, Layers, PieChart } from 'lucide-react';
import { QUESTION_DIFFICULTY } from '../../data/mockDashboardData';

interface QuestionBankOverviewProps {
  onOpenQuestionBank?: () => void;
  onOpenAIGenerator?: () => void;
}

export const QuestionBankOverview: React.FC<QuestionBankOverviewProps> = ({
  onOpenQuestionBank,
  onOpenAIGenerator,
}) => {
  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between h-full">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 font-['Space_Grotesk'] tracking-tight">
              Ngân hàng câu hỏi
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Phân loại độ khó và tốc độ đóng góp của AI
            </p>
          </div>
          <button
            onClick={onOpenQuestionBank}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
          >
            <span>Chi tiết</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Big Number & AI highlight */}
        <div className="py-3.5 flex items-baseline justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tổng số câu hỏi
            </div>
            <div className="text-3xl font-extrabold text-slate-900 font-['Space_Grotesk'] mt-0.5">
              1,248 <span className="text-xs font-medium text-slate-400">câu</span>
            </div>
          </div>

          <div
            onClick={onOpenAIGenerator}
            className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 text-right cursor-pointer hover:border-indigo-200 transition-all"
          >
            <div className="flex items-center justify-end gap-1 text-[11px] font-bold text-indigo-700">
              <Sparkles className="w-3 h-3 text-indigo-600" />
              <span>Đóng góp AI</span>
            </div>
            <div className="text-xs font-bold text-slate-800 mt-0.5">
              86 câu <span className="text-[10px] text-slate-500 font-normal">tháng này</span>
            </div>
          </div>
        </div>
      </div>

      {/* Difficulty Breakdown (Compact Progress Bars) */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
          <span>Theo độ khó</span>
          <span className="text-slate-400 font-medium text-[11px]">Tỷ lệ chuẩn hóa</span>
        </div>

        {/* Stacked Multi-Color Progress Bar */}
        <div className="w-full h-3 rounded-full overflow-hidden bg-slate-100 flex p-0.5 gap-0.5">
          <div
            style={{ width: '38%' }}
            className="bg-emerald-500 rounded-l-full h-full transition-all"
            title="Dễ: 38%"
          />
          <div
            style={{ width: '44%' }}
            className="bg-indigo-500 h-full transition-all"
            title="Trung bình: 44%"
          />
          <div
            style={{ width: '18%' }}
            className="bg-amber-500 rounded-r-full h-full transition-all"
            title="Khó: 18%"
          />
        </div>

        {/* Difficulty Items */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          {QUESTION_DIFFICULTY.map((item) => (
            <div
              key={item.label}
              className={`p-2 rounded-xl border ${item.badgeBg} text-center transition-all`}
            >
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-800">
                <span className={`w-2 h-2 rounded-full ${item.bgClass}`} />
                <span>{item.label}</span>
              </div>
              <div className="text-sm font-extrabold text-slate-900 mt-1">
                {item.percentage}%
              </div>
              <div className="text-[10px] text-slate-500">
                {item.count} câu
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
