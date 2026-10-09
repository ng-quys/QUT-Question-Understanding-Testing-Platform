import React from 'react';
import {
  FileSpreadsheet,
  CalendarClock,
  Sparkles,
  Edit3,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';

export type CreateSelectorType = 'exam' | 'question';

interface CreateTypeSelectorProps {
  type: CreateSelectorType;
  onBack: () => void;
  onSelectOption: (optionId: string) => void;
  backLabel?: string;
}

export const CreateTypeSelector: React.FC<CreateTypeSelectorProps> = ({
  type,
  onBack,
  onSelectOption,
  backLabel,
}) => {
  if (type === 'exam') {
    return (
      <div className="py-6 max-w-3xl mx-auto space-y-6">
        {/* Back navigation */}
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{backLabel || 'Quay lại Tổng quan'}</span>
          </button>
        </div>

        {/* Header */}
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">
            Bạn muốn tạo gì?
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Chọn loại nội dung bạn muốn tạo để tiếp tục.
          </p>
        </div>

        {/* Options Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Card 1: Đề thi */}
          <div
            onClick={() => onSelectOption('exam-content')}
            className="group p-5 bg-white border border-slate-200 rounded-lg hover:border-[var(--primary)] transition-all cursor-pointer flex flex-col justify-between min-h-[140px]"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border"
                  style={{
                    backgroundColor: 'var(--primary-light)',
                    color: 'var(--primary)',
                    borderColor: 'var(--primary-border)',
                  }}
                >
                  Tạo nội dung
                </span>
                <div
                  className="w-8 h-8 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
              </div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-[var(--primary)] transition-colors">
                Đề thi theo Ma trận OBE
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Quy trình 4 bước tinh gọn: Cấu hình ma trận OBE, bốc câu hỏi tự động, đổi câu tương đương, hoán vị mã đề và xuất Word/PDF.
              </p>
            </div>
            <div
              className="pt-3 flex items-center text-xs font-semibold"
              style={{ color: 'var(--primary)' }}
            >
              <span>Tạo đề theo chuẩn OBE</span>
              <ChevronRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>

          {/* Card 2: Ca thi */}
          <div
            onClick={() => onSelectOption('exam-session')}
            className="group p-5 bg-white border border-slate-200 rounded-lg hover:border-[var(--primary)] transition-all cursor-pointer flex flex-col justify-between min-h-[140px]"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  Tổ chức thi
                </span>
                <div className="w-8 h-8 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 transition-colors">
                  <CalendarClock className="w-4 h-4" />
                </div>
              </div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-[var(--primary)] transition-colors">
                Ca thi
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Thiết lập thời gian, thời lượng và sinh viên tham gia từ một đề thi đã có.
              </p>
            </div>
            <div
              className="pt-3 flex items-center text-xs font-semibold"
              style={{ color: 'var(--primary)' }}
            >
              <span>Thiết lập ca thi</span>
              <ChevronRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Question creation choice
  return (
    <div className="py-6 max-w-3xl mx-auto space-y-6">
      {/* Back navigation */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{backLabel || 'Quay lại Tổng quan'}</span>
        </button>
      </div>

      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">
          Bạn muốn tạo câu hỏi bằng cách nào?
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Chọn phương thức tạo câu hỏi để bắt đầu.
        </p>
      </div>

      {/* Options Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        {/* Card 1: Thêm thủ công */}
        <div
          onClick={() => onSelectOption('manual-question')}
          className="group p-5 bg-white border border-slate-200 rounded-lg hover:border-[var(--primary)] transition-all cursor-pointer flex flex-col justify-between min-h-[140px]"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                Nhập liệu
              </span>
              <div className="w-8 h-8 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 transition-colors">
                <Edit3 className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-base font-bold text-slate-900 group-hover:text-[var(--primary)] transition-colors">
              Thêm thủ công
            </h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Tạo câu hỏi trắc nghiệm và nhập đáp án trực tiếp vào ngân hàng câu hỏi.
            </p>
          </div>
          <div
            className="pt-3 flex items-center text-xs font-semibold"
            style={{ color: 'var(--primary)' }}
          >
            <span>Mở ngân hàng câu hỏi</span>
            <ChevronRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>

        {/* Card 2: Sinh bằng AI */}
        <div
          onClick={() => onSelectOption('ai-question')}
          className="group p-5 bg-white border border-slate-200 rounded-lg hover:border-[var(--primary)] transition-all cursor-pointer flex flex-col justify-between min-h-[140px]"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border"
                style={{
                  backgroundColor: 'var(--primary-light)',
                  color: 'var(--primary)',
                  borderColor: 'var(--primary-border)',
                }}
              >
                AI Trợ lý
              </span>
              <div
                className="w-8 h-8 rounded-md border flex items-center justify-center transition-colors"
                style={{
                  backgroundColor: 'var(--primary-light)',
                  borderColor: 'var(--primary-border)',
                  color: 'var(--primary)',
                }}
              >
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-base font-bold text-slate-900 group-hover:text-[var(--primary)] transition-colors">
              Sinh bằng AI
            </h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Sinh câu hỏi từ văn bản hoặc tài liệu bằng AI và đưa vào trạng thái chờ duyệt.
            </p>
          </div>
          <div
            className="pt-3 flex items-center text-xs font-semibold"
            style={{ color: 'var(--primary)' }}
          >
            <span>Mở trình sinh AI</span>
            <ChevronRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </div>
  );
};
