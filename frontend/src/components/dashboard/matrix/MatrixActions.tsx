import React from 'react';
import { Save, Eye, FileSpreadsheet, Sparkles, ArrowRight, ArrowLeft } from 'lucide-react';

interface MatrixActionsProps {
  matrixTotal: number;
  isValid: boolean;
  onSave: () => void;
  onPreview: () => void;
  onExportExcel: () => void;
  onGenerateWithAI: () => void;
  onBack?: () => void;
}

export const MatrixActions: React.FC<MatrixActionsProps> = ({
  matrixTotal,
  isValid,
  onSave,
  onPreview,
  onExportExcel,
  onGenerateWithAI,
  onBack,
}) => {
  const isButtonDisabled = !isValid || matrixTotal <= 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-4 z-30">
      {/* Left: Secondary actions */}
      <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-600" />
            <span>Quay lại Bước 1</span>
          </button>
        )}

        <button
          type="button"
          onClick={onSave}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
        >
          <Save className="w-3.5 h-3.5 text-slate-500" />
          <span>Lưu khung ma trận</span>
        </button>

        <button
          type="button"
          onClick={onPreview}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5 text-slate-500" />
          <span>Xem trước</span>
        </button>

        <button
          type="button"
          onClick={onExportExcel}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
          <span>Xuất Excel</span>
        </button>
      </div>

      {/* Right: Primary CTA */}
      <div className="w-full sm:w-auto flex items-center justify-end">
        <button
          type="button"
          disabled={isButtonDisabled}
          onClick={onGenerateWithAI}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-md hover:opacity-95 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          style={{
            backgroundColor: 'var(--primary)',
          }}
        >
          <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
          <span>Tiếp tục: Sinh câu hỏi bằng AI ({matrixTotal} câu)</span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0 ml-0.5" />
        </button>
      </div>
    </div>
  );
};
