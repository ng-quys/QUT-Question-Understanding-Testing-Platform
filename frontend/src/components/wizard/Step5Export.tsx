import React, { useState } from 'react';
import {
  FileCheck2,
  ArrowLeft,
  Download,
  Printer,
  CalendarPlus,
  CheckCircle,
  FileText,
  FileSpreadsheet,
  Share2,
  Sparkles,
} from 'lucide-react';

interface Step5Props {
  onPrev: () => void;
  onFinish: () => void;
}

export const Step5Export: React.FC<Step5Props> = ({ onPrev, onFinish }) => {
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const handleDownload = (type: string) => {
    setDownloadSuccess(`Đang tải xuống bộ đề thi định dạng ${type}...`);
    setTimeout(() => setDownloadSuccess(null), 3500);
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      <section className="app-bg-card rounded-2xl p-5 sm:p-7 border app-border shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b app-border-subtle mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold app-text-main font-['Plus_Jakarta_Sans',sans-serif]">
                Bước 5: Hoàn tất & Xuất Đề Thi
              </h2>
              <p className="text-xs app-text-muted">
                Đề thi đã được khởi tạo thành công theo đúng chuẩn ma trận và CLO
              </p>
            </div>
          </div>
        </div>

        {downloadSuccess && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>{downloadSuccess}</span>
          </div>
        )}

        {/* Summary Card */}
        <div className="p-5 sm:p-6 rounded-2xl bg-slate-50 border border-slate-200/80 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Đề thi đã sẵn sàng
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Đề thi Giữa kỳ - Lập trình Web nâng cao (2026-2027)
              </h3>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                <span>40 câu trắc nghiệm</span>
                <span>•</span>
                <span>Thời gian: 60 phút</span>
                <span>•</span>
                <span>4 mã đề (101, 102, 103, 104)</span>
                <span>•</span>
                <span>Đã gán 4 CLO</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onFinish}
            className="w-full md:w-auto px-6 py-3 rounded-xl font-bold text-xs sm:text-sm text-white shadow-md active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            Lưu & Về Dashboard
          </button>
        </div>

        {/* Export Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Export PDF */}
          <button
            type="button"
            onClick={() => handleDownload('PDF')}
            className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-md transition-all text-left group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Download className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">
              Tải file PDF (Đề & Đáp án)
            </h4>
            <p className="text-xs text-slate-500">
              Xuất trọn bộ 4 mã đề thi kèm phiếu trả lời trắc nghiệm chuẩn OMR
            </p>
          </button>

          {/* Export DOCX */}
          <button
            type="button"
            onClick={() => handleDownload('Word DOCX')}
            className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-md transition-all text-left group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">
              Tải file Word (.DOCX)
            </h4>
            <p className="text-xs text-slate-500">
              Dễ dàng tùy biến tiêu đề trường, logo khoa viện và in trực tiếp
            </p>
          </button>

          {/* Schedule Session */}
          <button
            type="button"
            onClick={onFinish}
            className="p-5 rounded-2xl border border-purple-200 bg-purple-50/40 hover:bg-purple-50/70 hover:shadow-md transition-all text-left group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <CalendarPlus className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-purple-950 mb-1">
              Tạo ngay Ca thi trực tuyến
            </h4>
            <p className="text-xs text-purple-800/80">
              Lên lịch ca thi độc lập và phát hành mã/link truy cập cho thí sinh
            </p>
          </button>
        </div>
      </section>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onPrev}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold shadow-xs transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại Bước 4</span>
        </button>

        <button
          type="button"
          onClick={onFinish}
          className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-bold text-sm shadow-lg transition-all cursor-pointer"
          style={{
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-text)',
            boxShadow: '0 4px 16px var(--primary-glow)',
          }}
        >
          <CheckCircle className="w-4 h-4" />
          <span>Hoàn tất & Quay lại Tổng quan</span>
        </button>
      </div>
    </div>
  );
};
