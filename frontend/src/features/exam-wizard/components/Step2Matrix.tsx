import React, { useState } from 'react';
import {
  Grid3X3,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  SlidersHorizontal,
  CheckCircle2,
} from 'lucide-react';

interface Step2Props {
  onNext: () => void;
  onPrev: () => void;
  onSaveDraft: () => void;
}

export const Step2Matrix: React.FC<Step2Props> = ({
  onNext,
  onPrev,
  onSaveDraft,
}) => {
  const [easyPercent, setEasyPercent] = useState<number>(40);
  const [mediumPercent, setMediumPercent] = useState<number>(40);
  const [hardPercent, setHardPercent] = useState<number>(20);
  const totalQuestions = 40;

  const easyCount = Math.round((totalQuestions * easyPercent) / 100);
  const mediumCount = Math.round((totalQuestions * mediumPercent) / 100);
  const hardCount = totalQuestions - easyCount - mediumCount;

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      <section className="app-bg-card rounded-2xl p-5 sm:p-7 border app-border shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b app-border-subtle mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <Grid3X3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold app-text-main font-['Plus_Jakarta_Sans',sans-serif]">
                Bước 2: Thiết lập Ma trận đề thi & Phân bổ câu hỏi
              </h2>
              <p className="text-xs app-text-muted">
                Phân bổ số lượng câu hỏi theo từng Chuẩn đầu ra (CLO) và mức độ tư duy Bloom
              </p>
            </div>
          </div>
          <span
            className="hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
            style={{
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary)',
              border: '1px solid var(--primary-border)',
            }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Tổng 40 câu hỏi
          </span>
        </div>

        {/* Sliders phân bổ độ khó */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200/80 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
              <SlidersHorizontal className="w-4 h-4" style={{ color: 'var(--primary)' }} />
              Tỷ lệ phân bổ độ khó đề thi:
            </div>
            <div className="text-xs font-bold text-slate-800">
              Dễ: {easyPercent}% ({easyCount} câu) • Vừa: {mediumPercent}% ({mediumCount} câu) • Khó: {hardPercent}% ({hardCount} câu)
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-emerald-700 mb-1 flex justify-between">
                <span>Mức Dễ (Nhận biết):</span>
                <span>{easyPercent}%</span>
              </label>
              <input
                type="range"
                min="10"
                max="70"
                value={easyPercent}
                onChange={(e) => setEasyPercent(Number(e.target.value))}
                className="w-full accent-emerald-600"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-blue-700 mb-1 flex justify-between">
                <span>Mức Vừa (Thông hiểu & Vận dụng):</span>
                <span>{mediumPercent}%</span>
              </label>
              <input
                type="range"
                min="10"
                max="70"
                value={mediumPercent}
                onChange={(e) => setMediumPercent(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-purple-700 mb-1 flex justify-between">
                <span>Mức Khó (Vận dụng cao):</span>
                <span>{hardPercent}%</span>
              </label>
              <input
                type="range"
                min="5"
                max="50"
                value={hardPercent}
                onChange={(e) => setHardPercent(Number(e.target.value))}
                className="w-full accent-purple-600"
              />
            </div>
          </div>
        </div>

        {/* Matrix Table by CLO */}
        <div className="overflow-x-auto border border-slate-200/90 rounded-xl bg-white shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-3.5">Mã CLO & Nội dung</th>
                <th className="py-3 px-3.5 text-center text-emerald-700">Nhận biết</th>
                <th className="py-3 px-3.5 text-center text-blue-700">Thông hiểu</th>
                <th className="py-3 px-3.5 text-center text-indigo-700">Vận dụng</th>
                <th className="py-3 px-3.5 text-center text-purple-700">Vận dụng cao</th>
                <th className="py-3 px-3.5 text-center font-bold">Tổng câu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3 px-3.5 font-medium">CLO 1.1: Kiến trúc Client-Server, Virtual DOM</td>
                <td className="py-3 px-3.5 text-center font-bold">4</td>
                <td className="py-3 px-3.5 text-center font-bold">4</td>
                <td className="py-3 px-3.5 text-center text-slate-400">0</td>
                <td className="py-3 px-3.5 text-center text-slate-400">0</td>
                <td className="py-3 px-3.5 text-center font-bold text-slate-900 bg-slate-50">8 câu (20%)</td>
              </tr>
              <tr>
                <td className="py-3 px-3.5 font-medium">CLO 1.2: RESTful API & Node.js Middleware</td>
                <td className="py-3 px-3.5 text-center font-bold">4</td>
                <td className="py-3 px-3.5 text-center font-bold">4</td>
                <td className="py-3 px-3.5 text-center font-bold">2</td>
                <td className="py-3 px-3.5 text-center text-slate-400">0</td>
                <td className="py-3 px-3.5 text-center font-bold text-slate-900 bg-slate-50">10 câu (25%)</td>
              </tr>
              <tr>
                <td className="py-3 px-3.5 font-medium">CLO 2.1: React Hooks, Context & State Mgmt</td>
                <td className="py-3 px-3.5 text-center text-slate-400">0</td>
                <td className="py-3 px-3.5 text-center font-bold">4</td>
                <td className="py-3 px-3.5 text-center font-bold">6</td>
                <td className="py-3 px-3.5 text-center font-bold">2</td>
                <td className="py-3 px-3.5 text-center font-bold text-slate-900 bg-slate-50">12 câu (30%)</td>
              </tr>
              <tr>
                <td className="py-3 px-3.5 font-medium">CLO 3.1: JWT Security, RBAC & Performance</td>
                <td className="py-3 px-3.5 text-center text-slate-400">0</td>
                <td className="py-3 px-3.5 text-center text-slate-400">0</td>
                <td className="py-3 px-3.5 text-center font-bold">6</td>
                <td className="py-3 px-3.5 text-center font-bold">4</td>
                <td className="py-3 px-3.5 text-center font-bold text-slate-900 bg-slate-50">10 câu (25%)</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/80 font-bold border-t border-slate-200">
                <td className="py-3 px-3.5">Tổng cộng</td>
                <td className="py-3 px-3.5 text-center text-emerald-700">8 câu</td>
                <td className="py-3 px-3.5 text-center text-blue-700">12 câu</td>
                <td className="py-3 px-3.5 text-center text-indigo-700">14 câu</td>
                <td className="py-3 px-3.5 text-center text-purple-700">6 câu</td>
                <td className="py-3 px-3.5 text-center text-indigo-700 bg-indigo-50/70">40 câu (100%)</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Navigation Buttons */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onPrev}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold shadow-xs transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại Bước 1</span>
        </button>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={onNext}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-bold text-sm shadow-lg transition-all cursor-pointer"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-text)',
              boxShadow: '0 4px 16px var(--primary-glow)',
            }}
          >
            <span>Tiếp tục sang Bước 3 (Hiệu chỉnh câu hỏi)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
