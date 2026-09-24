import React, { useState } from 'react';
import {
  ListFilter,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Database,
  CheckCircle2,
  Edit2,
  Trash2,
  Shuffle,
} from 'lucide-react';

interface Step3Props {
  onNext: () => void;
  onPrev: () => void;
  onSaveDraft: () => void;
}

const SAMPLE_QUESTIONS = [
  {
    id: 'Q1',
    content: 'Trong React 18, Hook nào sau đây được sử dụng để tối ưu hóa hiệu năng bằng cách ghi nhớ (memoize) kết quả tính toán có chi phí cao?',
    options: ['A. useEffect', 'B. useMemo (Đáp án đúng)', 'C. useCallback', 'D. useRef'],
    bloom: 'Vận dụng',
    bloomClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    clo: 'CLO 2.1',
    source: 'AI Sinh từ Slide Chương 2',
  },
  {
    id: 'Q2',
    content: 'Middleware trong Express.js nhận vào các tham số nào sau đây theo đúng thứ tự tiêu chuẩn?',
    options: ['A. (req, res, next) (Đáp án đúng)', 'B. (res, req, send)', 'C. (request, response, error)', 'D. (context, next, handler)'],
    bloom: 'Nhận biết',
    bloomClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    clo: 'CLO 1.2',
    source: 'Ngân hàng đề thi INT3306',
  },
  {
    id: 'Q3',
    content: 'Để phòng chống tấn công Cross-Site Scripting (XSS) trong ứng dụng React, giải pháp nào sau đây là KHÔNG an toàn?',
    options: ['A. Luôn sử dụng dangerouslySetInnerHTML mà không sanitize (Đáp án đúng)', 'B. Sử dụng thư viện DOMPurify để làm sạch HTML', 'C. Thiết lập Content Security Policy (CSP) chặt chẽ', 'D. Tránh đưa trực tiếp chuỗi chưa kiểm duyệt vào DOM'],
    bloom: 'Vận dụng cao',
    bloomClass: 'bg-purple-50 text-purple-700 border-purple-200',
    clo: 'CLO 3.1',
    source: 'AI Sinh từ Giáo trình Web',
  },
];

export const Step3Questions: React.FC<Step3Props> = ({
  onNext,
  onPrev,
  onSaveDraft,
}) => {
  const [questions, setQuestions] = useState(SAMPLE_QUESTIONS);

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      <section className="app-bg-card rounded-2xl p-5 sm:p-7 border app-border shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b app-border-subtle mb-5 gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <ListFilter className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold app-text-main font-['Plus_Jakarta_Sans',sans-serif]">
                Bước 3: Hiệu chỉnh và Duyệt câu hỏi thi
              </h2>
              <p className="text-xs app-text-muted">
                Kiểm tra, sửa nội dung câu hỏi do AI sinh và trộn thêm từ ngân hàng câu hỏi
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 transition-colors"
            >
              <Shuffle className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
              <span>Đổi câu hỏi khác</span>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div
              key={q.id}
              className="p-4 sm:p-5 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all shadow-xs space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="px-2.5 py-0.5 rounded-md text-xs font-bold"
                    style={{
                      backgroundColor: 'var(--primary-light)',
                      color: 'var(--primary)',
                    }}
                  >
                    Câu {idx + 1}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-100 text-slate-700">
                    {q.clo}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${q.bloomClass}`}>
                    {q.bloom}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Nguồn: {q.source}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestions((prev) => prev.filter((item) => item.id !== q.id))}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                {q.content}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {q.options.map((opt, optIdx) => (
                  <div
                    key={optIdx}
                    className={`p-2.5 rounded-lg border text-xs font-medium ${
                      opt.includes('Đáp án đúng')
                        ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    {opt}
                  </div>
                ))}
              </div>
            </div>
          ))}
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
          <span>Quay lại Bước 2</span>
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
            <span>Tiếp tục sang Bước 4 (Tùy chỉnh)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
