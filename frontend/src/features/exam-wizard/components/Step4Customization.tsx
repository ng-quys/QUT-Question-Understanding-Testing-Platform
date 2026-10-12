import React, { useState } from 'react';
import {
  Sliders,
  ArrowRight,
  ArrowLeft,
  Shuffle,
  ShieldCheck,
  Clock,
  Eye,
  Settings,
  Sparkles,
} from 'lucide-react';

interface Step4Props {
  onNext: () => void;
  onPrev: () => void;
  onSaveDraft: () => void;
}

export const Step4Customization: React.FC<Step4Props> = ({
  onNext,
  onPrev,
  onSaveDraft,
}) => {
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [antiCheating, setAntiCheating] = useState(true);
  const [numberOfVariants, setNumberOfVariants] = useState<number>(4);
  const [scoringMethod, setScoringMethod] = useState<'standard' | 'penalty'>('standard');

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      <section className="app-bg-card rounded-2xl p-5 sm:p-7 border app-border shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b app-border-subtle mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold app-text-main font-['Plus_Jakarta_Sans',sans-serif]">
                Bước 4: Tùy chỉnh Cấu hình Đề thi & Chống gian lận
              </h2>
              <p className="text-xs app-text-muted">
                Thiết lập số mã đề xáo trộn, cơ chế bảo mật phòng thi và thang điểm
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Cấu hình Trộn đề */}
          <div className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white space-y-4 shadow-xs">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Shuffle className="w-4 h-4" style={{ color: 'var(--primary)' }} />
              Xáo trộn câu hỏi & Mã đề
            </h3>

            <div className="space-y-3 text-xs">
              <label className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200/80 cursor-pointer">
                <div>
                  <div className="font-bold text-slate-800">Đảo thứ tự câu hỏi</div>
                  <div className="text-slate-500 text-[11px]">Mỗi sinh viên nhận thứ tự câu khác nhau</div>
                </div>
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: 'var(--primary)' }}
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200/80 cursor-pointer">
                <div>
                  <div className="font-bold text-slate-800">Đảo thứ tự đáp án (A, B, C, D)</div>
                  <div className="text-slate-500 text-[11px]">Tránh nhìn bài và chép đáp án bạn bên cạnh</div>
                </div>
                <input
                  type="checkbox"
                  checked={shuffleOptions}
                  onChange={(e) => setShuffleOptions(e.target.checked)}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: 'var(--primary)' }}
                />
              </label>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Số lượng mã đề in ra (Mã 101, 102, 103, 104...)
                </label>
                <select
                  value={numberOfVariants}
                  onChange={(e) => setNumberOfVariants(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
                >
                  <option value={2}>2 mã đề (101, 102)</option>
                  <option value={4}>4 mã đề chuẩn (101, 102, 103, 104)</option>
                  <option value={8}>8 mã đề phân tán cao</option>
                  <option value={10}>10 mã đề ngẫu nhiên</option>
                </select>
              </div>
            </div>
          </div>

          {/* Cấu hình Bảo mật thi */}
          <div className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white space-y-4 shadow-xs">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Chế độ giám sát & Bảo mật trực tuyến
            </h3>

            <div className="space-y-3 text-xs">
              <label className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200/80 cursor-pointer">
                <div>
                  <div className="font-bold text-slate-800">Chế độ Toàn màn hình & Khóa Tab</div>
                  <div className="text-slate-500 text-[11px]">Cảnh báo nếu sinh viên chuyển sang tab khác</div>
                </div>
                <input
                  type="checkbox"
                  checked={antiCheating}
                  onChange={(e) => setAntiCheating(e.target.checked)}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: 'var(--primary)' }}
                />
              </label>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Quy tắc tính điểm
                </label>
                <select
                  value={scoringMethod}
                  onChange={(e) => setScoringMethod(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
                >
                  <option value="standard">Thang điểm 10 chuẩn (Mỗi câu đúng 0.25đ)</option>
                  <option value="penalty">Có trừ điểm khi chọn sai (-0.1đ/câu sai)</option>
                </select>
              </div>

              <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200 text-blue-800 text-[11px]">
                💡 <span className="font-bold">Lưu ý:</span> Đề thi sau khi xuất sẽ được tự động tích hợp mã QR xác thực và watermark chống sao chép đề trái phép.
              </div>
            </div>
          </div>
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
          <span>Quay lại Bước 3</span>
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
            <span>Tiếp tục sang Bước 5 (Xuất đề thi)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
