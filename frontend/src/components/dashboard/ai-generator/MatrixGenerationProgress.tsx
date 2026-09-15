import React, { useEffect, useState } from 'react';
import { Sparkles, Brain, CheckCircle2, Layers, Cpu, Compass } from 'lucide-react';
import { QuestionItem, Course, CourseChapter, CourseCLO } from '../../../types';
import { MatrixKnowledgeUnit, MatrixSummaryStats } from '../matrix/types';
import { generateQuestionsFromMatrix } from './matrixQuestionGenerator';

interface MatrixGenerationProgressProps {
  courseId: string;
  totalQuestions: number;
  units: MatrixKnowledgeUnit[];
  summary: MatrixSummaryStats;
  aiInstruction: string;
  defaultScore?: number;
  courses: Course[];
  chapters: CourseChapter[];
  clos: CourseCLO[];
  onComplete: (questions: QuestionItem[]) => void;
  onCancel: () => void;
}

export const MatrixGenerationProgress: React.FC<MatrixGenerationProgressProps> = ({
  courseId,
  totalQuestions,
  units,
  summary,
  aiInstruction,
  defaultScore = 0.5,
  courses,
  chapters,
  clos,
  onComplete,
  onCancel,
}) => {
  const [percent, setPercent] = useState(10);
  const [currentUnitName, setCurrentUnitName] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('Khởi tạo mô hình AI...');

  const course = courses.find((c) => c.id === courseId);
  const courseName = course ? `${course.code} - ${course.name}` : 'Học phần';

  useEffect(() => {
    // Generate questions
    const generatedQuestions = generateQuestionsFromMatrix(
      courseId,
      units,
      chapters,
      clos,
      aiInstruction,
      defaultScore
    );

    const activeUnits = units.filter((u) => u.total > 0);

    const t1 = setTimeout(() => {
      setPercent(30);
      setCurrentUnitName(activeUnits[0]?.name || 'Chuyên đề học phần');
      setStatusMessage(`Đang phân bổ theo ma trận: ${summary.nbTotal} NB, ${summary.thTotal} TH, ${summary.vdTotal} VD...`);
    }, 600);

    const t2 = setTimeout(() => {
      setPercent(65);
      const midUnit = activeUnits[Math.floor(activeUnits.length / 2)] || activeUnits[0];
      setCurrentUnitName(midUnit?.name || 'Chuẩn đầu ra');
      setStatusMessage('Đang biên soạn nội dung học thuật, tạo phương án nhiễu & giải thích...');
    }, 1400);

    const t3 = setTimeout(() => {
      setPercent(90);
      setCurrentUnitName(activeUnits[activeUnits.length - 1]?.name || 'Hoàn tất');
      setStatusMessage('Đang thẩm định chất lượng câu hỏi đối với chuẩn CLO...');
    }, 2200);

    const t4 = setTimeout(() => {
      setPercent(100);
      setStatusMessage('Hoàn thành! Đang mở giao diện kiểm duyệt...');
      setTimeout(() => {
        onComplete(generatedQuestions);
      }, 500);
    }, 2800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [courseId, units, chapters, clos, aiInstruction, onComplete, summary]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center shadow-lg max-w-xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-200">
      {/* Animated AI Core */}
      <div
        className="relative mx-auto w-20 h-20 rounded-2xl flex items-center justify-center text-white shadow-xl"
        style={{ backgroundColor: 'var(--primary)' }}
      >
        <Sparkles className="w-10 h-10 animate-spin" style={{ animationDuration: '6s' }} />
        <div
          className="absolute -inset-2 rounded-2xl opacity-25 animate-ping pointer-events-none"
          style={{ backgroundColor: 'var(--primary)' }}
        ></div>
      </div>

      <div>
        <h3 className="text-xl font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif]">
          AI đang sinh {totalQuestions} câu hỏi theo Ma trận
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Học phần: <strong className="text-slate-800">{courseName}</strong>
        </p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-slate-200/80">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-1"
            style={{
              width: `${percent}%`,
              backgroundColor: 'var(--primary)',
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
          </div>
        </div>
        <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
          <span className="flex items-center gap-1.5 text-slate-700">
            <Cpu className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
            {statusMessage}
          </span>
          <span className="text-indigo-700 font-mono font-bold">{percent}%</span>
        </div>
      </div>

      {/* Breakdown Badges */}
      <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
        <div className="text-center">
          <div className="text-slate-500 text-[11px]">Nhận biết (NB)</div>
          <div className="font-bold text-emerald-700 text-sm mt-0.5">{summary.nbTotal} câu ({summary.nbPercent}%)</div>
        </div>
        <div className="text-center border-x border-slate-200">
          <div className="text-slate-500 text-[11px]">Thông hiểu (TH)</div>
          <div className="font-bold text-blue-700 text-sm mt-0.5">{summary.thTotal} câu ({summary.thPercent}%)</div>
        </div>
        <div className="text-center">
          <div className="text-slate-500 text-[11px]">Vận dụng (VD)</div>
          <div className="font-bold text-indigo-700 text-sm mt-0.5">{summary.vdTotal} câu ({summary.vdPercent}%)</div>
        </div>
      </div>

      {currentUnitName && (
        <div className="text-xs text-slate-500 bg-indigo-50/70 border border-indigo-100 rounded-lg py-2 px-3 flex items-center justify-center gap-2">
          <Compass className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span className="truncate">Đang xử lý: <strong className="text-indigo-900">{currentUnitName}</strong></span>
        </div>
      )}

      {/* Cancel button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-slate-400 hover:text-rose-600 transition-colors cursor-pointer underline"
        >
          Hủy bỏ quá trình sinh
        </button>
      </div>
    </div>
  );
};
