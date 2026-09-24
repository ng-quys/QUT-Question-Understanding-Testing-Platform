import React from 'react';
import { CheckCircle, AlertTriangle, Edit3, HelpCircle, ShieldCheck } from 'lucide-react';
import { QUESTION_QUALITY } from '../../data/mockDashboardData';

export const QuestionQualityWidget: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 font-['Space_Grotesk'] tracking-tight">
            Chất lượng câu hỏi
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Đánh giá chỉ số phân biệt (DI) & độ tin cậy đề thi
          </p>
        </div>
        <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
          <ShieldCheck className="w-4 h-4" />
        </span>
      </div>

      <div className="space-y-3 my-auto py-2">
        {/* Tốt */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="flex items-center gap-1.5 font-bold text-slate-800">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span>{QUESTION_QUALITY.good.label}</span>
            </span>
            <span className="font-extrabold text-emerald-600">{QUESTION_QUALITY.good.percentage}% ({QUESTION_QUALITY.good.count} câu)</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all"
              style={{ width: `${QUESTION_QUALITY.good.percentage}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">{QUESTION_QUALITY.good.desc}</p>
        </div>

        {/* Cần xem xét */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="flex items-center gap-1.5 font-bold text-slate-800">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>{QUESTION_QUALITY.review.label}</span>
            </span>
            <span className="font-extrabold text-amber-600">{QUESTION_QUALITY.review.percentage}% ({QUESTION_QUALITY.review.count} câu)</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-amber-500 h-2 rounded-full transition-all"
              style={{ width: `${QUESTION_QUALITY.review.percentage}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">{QUESTION_QUALITY.review.desc}</p>
        </div>

        {/* Nên chỉnh sửa */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="flex items-center gap-1.5 font-bold text-slate-800">
              <Edit3 className="w-3.5 h-3.5 text-rose-500" />
              <span>{QUESTION_QUALITY.edit.label}</span>
            </span>
            <span className="font-extrabold text-rose-600">{QUESTION_QUALITY.edit.percentage}% ({QUESTION_QUALITY.edit.count} câu)</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-rose-500 h-2 rounded-full transition-all"
              style={{ width: `${QUESTION_QUALITY.edit.percentage}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">{QUESTION_QUALITY.edit.desc}</p>
        </div>
      </div>

      <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span>Tự động tính toán sau mỗi ca thi</span>
        <button className="text-indigo-600 hover:underline font-semibold cursor-pointer">
          Xem gợi ý AI
        </button>
      </div>
    </div>
  );
};
