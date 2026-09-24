import React, { useState, useMemo } from 'react';
import {
  FileCheck,
  Sparkles,
  Layers,
  Clock,
  Shuffle,
  Printer,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  SlidersHorizontal,
  ChevronDown,
  BookOpen,
  Eye,
  X,
} from 'lucide-react';
import { Course, CourseChapter, CourseCLO, QuestionItem, Bloom3Level } from '../../../types';
import { BLOOM_3_CONFIG } from '../../../data/mockAcademicData';

export interface ExamMatrixBuilderPageProps {
  courses: Course[];
  chapters: CourseChapter[];
  clos: CourseCLO[];
  questions: QuestionItem[];
  onShowToast: (msg: string) => void;
  onOpenAIGenerator: () => void;
  onUpdateCourses?: (courses: Course[]) => void;
  onUpdateChapters?: (chapters: CourseChapter[]) => void;
  onSaveGeneratedExam?: (examTitle: string, selectedQuestions: QuestionItem[]) => void;
}

export const ExamMatrixBuilderPage: React.FC<ExamMatrixBuilderPageProps> = ({
  courses,
  chapters,
  clos,
  questions,
  onShowToast,
  onOpenAIGenerator,
  onSaveGeneratedExam,
}) => {
  // 1. Course Selection
  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => {
    const ti01 = courses.find((c) => c.code === 'TI01');
    return ti01 ? ti01.id : courses[0]?.id || '';
  });

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];
  const courseChapters = chapters.filter((c) => c.courseId === selectedCourseId);
  const courseCLOs = clos.filter((c) => c.courseId === selectedCourseId);
  const courseQuestions = questions.filter((q) => q.courseId === selectedCourseId);

  // 2. Exam Configuration Settings
  const [generationMode, setGenerationMode] = useState<'matrix' | 'random'>('matrix');
  const [examTitle, setExamTitle] = useState<string>(
    `Đề thi Kết thúc học phần - ${selectedCourse?.name || 'Trí tuệ nhân tạo'}`
  );
  const [examCode, setExamCode] = useState<string>(`${selectedCourse?.code || 'TI01'}-CK-2026`);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [totalQuestions, setTotalQuestions] = useState<number>(40);
  const [variantCount, setVariantCount] = useState<number>(4); // 4 mã đề: 101, 102, 103, 104

  // Bloom distribution percentages
  const [easyPercent, setEasyPercent] = useState<number>(40); // Nhận biết
  const [mediumPercent, setMediumPercent] = useState<number>(40); // Thông hiểu
  const [hardPercent, setHardPercent] = useState<number>(20); // Vận dụng

  // Modal State for Previewing Assembled Exam
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activeVariantTab, setActiveVariantTab] = useState<string>('101');
  const [extractedQuestions, setExtractedQuestions] = useState<QuestionItem[]>([]);

  // Calculate target counts based on percentages
  const targetEasy = Math.round((totalQuestions * easyPercent) / 100);
  const targetMedium = Math.round((totalQuestions * mediumPercent) / 100);
  const targetHard = Math.max(0, totalQuestions - targetEasy - targetMedium);

  // Bank availability calculations
  const bankEasyCount = courseQuestions.filter((q) => q.bloom === 'remember').length;
  const bankMediumCount = courseQuestions.filter((q) => q.bloom === 'understand').length;
  const bankHardCount = courseQuestions.filter((q) => q.bloom === 'apply').length;

  const isBankSufficient =
    generationMode === 'random'
      ? courseQuestions.length >= totalQuestions
      : bankEasyCount >= targetEasy &&
        bankMediumCount >= targetMedium &&
        bankHardCount >= targetHard;

  // Handle Generate / Extract Exam
  const handleExtractExam = () => {
    // Select questions matching requirements
    const selected: QuestionItem[] = [];

    if (generationMode === 'random') {
      // Rapid random selection
      const shuffled = [...courseQuestions].sort(() => 0.5 - Math.random());
      for (let i = 0; i < totalQuestions; i++) {
        if (shuffled[i]) {
          selected.push(shuffled[i]);
        } else if (courseQuestions[i % courseQuestions.length]) {
          selected.push(courseQuestions[i % courseQuestions.length]);
        }
      }
    } else {
      // Matrix-based distribution
      const easyPool = courseQuestions.filter((q) => q.bloom === 'remember');
      const medPool = courseQuestions.filter((q) => q.bloom === 'understand');
      const hardPool = courseQuestions.filter((q) => q.bloom === 'apply');

      // Pick easy
      for (let i = 0; i < targetEasy; i++) {
        if (easyPool[i]) selected.push(easyPool[i]);
        else if (courseQuestions[i % courseQuestions.length]) {
          selected.push(courseQuestions[i % courseQuestions.length]);
        }
      }

      // Pick medium
      for (let i = 0; i < targetMedium; i++) {
        if (medPool[i]) selected.push(medPool[i]);
        else if (courseQuestions[(i + targetEasy) % courseQuestions.length]) {
          selected.push(courseQuestions[(i + targetEasy) % courseQuestions.length]);
        }
      }

      // Pick hard
      for (let i = 0; i < targetHard; i++) {
        if (hardPool[i]) selected.push(hardPool[i]);
        else if (courseQuestions[(i + targetEasy + targetMedium) % courseQuestions.length]) {
          selected.push(courseQuestions[(i + targetEasy + targetMedium) % courseQuestions.length]);
        }
      }
    }

    setExtractedQuestions(selected);
    setIsPreviewOpen(true);
    onShowToast(
      generationMode === 'random'
        ? `Đã bốc ngẫu nhiên thành công ${selected.length} câu hỏi từ ngân hàng!`
        : `Đã rút trích thành công ${selected.length} câu hỏi theo cấu trúc ma trận đề thi!`
    );
  };

  const handleSaveExam = () => {
    if (onSaveGeneratedExam) {
      onSaveGeneratedExam(examTitle, extractedQuestions);
    } else {
      onShowToast(`Đã lưu đề thi "${examTitle}" thành công!`);
    }
    setIsPreviewOpen(false);
  };

  const handleExportPDF = () => {
    onShowToast(`Đang kết xuất ${variantCount} mã đề thi dạng PDF in ấn chính thức...`);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif] flex items-center gap-2">
            <span>Tạo đề nhanh</span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded text-white tracking-wider uppercase shadow-2xs"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              Đề thi
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tính năng tạo nhanh đề thi ngẫu nhiên bám sát ma trận Bloom hoặc số lượng câu hỏi từ ngân hàng
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Generation Mode Switcher */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => setGenerationMode('matrix')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                generationMode === 'matrix'
                  ? 'bg-white text-indigo-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🎯 Bám sát Ma trận Bloom
            </button>
            <button
              type="button"
              onClick={() => setGenerationMode('random')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                generationMode === 'random'
                  ? 'bg-white text-indigo-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🎲 Rút ngẫu nhiên nhanh
            </button>
          </div>

          {/* Quick Link to AI Generator if bank needs more questions */}
          <button
            type="button"
            onClick={onOpenAIGenerator}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Sinh câu hỏi bằng AI</span>
          </button>
        </div>
      </div>

      {/* Target Course Selector & Global Specs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: Exam Specs */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              Thông số đề thi chính thức
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Học phần:</span>
              <select
                value={selectedCourseId}
                onChange={(e) => {
                  setSelectedCourseId(e.target.value);
                  const c = courses.find((item) => item.id === e.target.value);
                  if (c) {
                    setExamTitle(`Đề thi Kết thúc học phần - ${c.name}`);
                    setExamCode(`${c.code}-CK-2026`);
                  }
                }}
                className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Tên kỳ thi / Đề thi
              </label>
              <input
                type="text"
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Mã đề gốc
              </label>
              <input
                type="text"
                value={examCode}
                onChange={(e) => setExamCode(e.target.value)}
                className="w-full text-xs font-mono text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Thời lượng thi
                </label>
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="number"
                    min={15}
                    max={180}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-12 bg-transparent text-xs font-bold text-slate-800 focus:outline-none"
                  />
                  <span className="text-slate-500 text-[11px]">phút</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Số lượng câu thi
                </label>
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
                  <FileCheck className="w-3.5 h-3.5 text-indigo-600" />
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={totalQuestions}
                    onChange={(e) => setTotalQuestions(Number(e.target.value))}
                    className="w-12 bg-transparent text-xs font-bold text-slate-800 focus:outline-none"
                  />
                  <span className="text-slate-500 text-[11px]">câu</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Mã đề hoán vị
                </label>
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
                  <Shuffle className="w-3.5 h-3.5 text-purple-600" />
                  <select
                    value={variantCount}
                    onChange={(e) => setVariantCount(Number(e.target.value))}
                    className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer w-full"
                  >
                    <option value={2}>2 mã đề (101, 102)</option>
                    <option value={4}>4 mã đề (101, 102, 103, 104)</option>
                    <option value={6}>6 mã đề (101-106)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Bloom Distribution & Bank Readiness */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4 flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2 mb-3">
              <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
              Tỷ lệ Bloom mục tiêu
            </span>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Nhận biết ({easyPercent}%)
                </span>
                <span className="font-mono font-bold text-slate-800">
                  {targetEasy} câu
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-700 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Thông hiểu ({mediumPercent}%)
                </span>
                <span className="font-mono font-bold text-slate-800">
                  {targetMedium} câu
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-indigo-700 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                  Vận dụng ({hardPercent}%)
                </span>
                <span className="font-mono font-bold text-slate-800">
                  {targetHard} câu
                </span>
              </div>
            </div>
          </div>

          {/* Bank Status Banner */}
          <div
            className={`p-3 rounded-lg border text-xs ${
              isBankSufficient
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                : 'bg-amber-50/80 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-center gap-2 font-bold mb-1">
              {isBankSufficient ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600" />
              )}
              <span>
                {isBankSufficient
                  ? 'Ngân hàng câu hỏi đủ điều kiện'
                  : 'Ngân hàng đang thiếu câu hỏi'}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed opacity-90">
              Hiện có <strong className="font-bold">{courseQuestions.length} câu</strong> sẵn sàng trong ngân hàng của học phần này. Cần tối thiểu {totalQuestions} câu để rút trích đề thi.
            </p>
          </div>
        </div>
      </div>

      {/* Chapter Breakdown Matrix Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 border-b border-slate-200/80 bg-slate-50/60 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Khung ma trận phân bổ câu hỏi đề thi theo chương
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Số câu hỏi rút trích từ ngân hàng theo từng chương và chuẩn đầu ra (CLO)
            </p>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Điểm số: <strong className="text-slate-800 font-bold">10.0 điểm</strong> (0.25đ / câu)
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 text-slate-600 border-b border-slate-200 font-semibold">
                <th className="py-2.5 px-3 w-10 text-center">TT</th>
                <th className="py-2.5 px-3 min-w-[200px]">Chương / Chủ đề</th>
                <th className="py-2.5 px-3 min-w-[140px]">Chuẩn đầu ra (CLO)</th>
                <th className="py-2.5 px-3 text-center w-28">Nhận biết</th>
                <th className="py-2.5 px-3 text-center w-28">Thông hiểu</th>
                <th className="py-2.5 px-3 text-center w-28">Vận dụng</th>
                <th className="py-2.5 px-3 text-center w-24">Tổng câu</th>
                <th className="py-2.5 px-3 text-center w-24">Trọng số</th>
                <th className="py-2.5 px-3 text-center w-32">Ngân hàng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {courseChapters.map((chapter, idx) => {
                const chapCLOs = courseCLOs.filter((c) =>
                  chapter.topics.some((t) => t.cloId === c.id)
                );
                const chapQuestions = courseQuestions.filter((q) => q.chapterId === chapter.id);

                // Proportional questions per chapter
                const chapAllocated = Math.round(
                  (totalQuestions * (chapter.weightPercent || 33.3)) / 100
                );
                const chapNb = Math.round((chapAllocated * easyPercent) / 100);
                const chapTh = Math.round((chapAllocated * mediumPercent) / 100);
                const chapVd = Math.max(0, chapAllocated - chapNb - chapTh);

                return (
                  <tr key={chapter.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3 text-center text-slate-400 font-mono">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-800">
                      <div>{chapter.title}</div>
                      <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                        {chapter.topics.length} chuyên đề con
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {chapCLOs.length > 0 ? (
                          chapCLOs.map((clo) => (
                            <span
                              key={clo.id}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                            >
                              {clo.code}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 text-[11px]">CLO 1.1</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="font-bold text-emerald-700 font-mono">{chapNb}</span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="font-bold text-blue-700 font-mono">{chapTh}</span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="font-bold text-indigo-700 font-mono">{chapVd}</span>
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-900 font-mono">
                      {chapAllocated}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-600 font-medium">
                      {chapter.weightPercent || 33}%
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          chapQuestions.length >= chapAllocated
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {chapQuestions.length} / {chapAllocated} câu
                      </span>
                    </td>
                  </tr>
                );
              })}

              {/* Aggregated Totals Row */}
              <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                <td className="py-3 px-3 text-center uppercase tracking-wider" colSpan={3}>
                  TỔNG CỘNG ĐỀ THI
                </td>
                <td className="py-3 px-3 text-center text-emerald-800 font-mono">
                  {targetEasy} ({easyPercent}%)
                </td>
                <td className="py-3 px-3 text-center text-blue-800 font-mono">
                  {targetMedium} ({mediumPercent}%)
                </td>
                <td className="py-3 px-3 text-center text-indigo-800 font-mono">
                  {targetHard} ({hardPercent}%)
                </td>
                <td className="py-3 px-3 text-center text-slate-900 font-mono text-sm">
                  {totalQuestions}
                </td>
                <td className="py-3 px-3 text-center">100%</td>
                <td className="py-3 px-3 text-center">
                  <span className="text-[11px] font-semibold text-slate-700">
                    {courseQuestions.length} câu sẵn sàng
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Actions Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          Cấu trúc đề: <strong className="text-slate-800">{totalQuestions} câu trắc nghiệm</strong> • {variantCount} mã đề hoán vị • Thời lượng {durationMinutes} phút
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={handleExportPDF}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Xuất khung ma trận</span>
          </button>

          <button
            type="button"
            onClick={handleExtractExam}
            className="px-5 py-2 rounded-lg text-xs font-bold text-white shadow-xs transition-all flex items-center gap-2 cursor-pointer hover:opacity-90"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <FileCheck className="w-4 h-4" />
            <span>Rút trích & Tạo đề thi ({variantCount} mã đề)</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL: PREVIEW ASSEMBLED EXAM PAPERS & ANSWER KEYS        */}
      {/* ======================================================== */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif]">
                  Xem trước Bộ đề thi chính thức
                </h3>
                <p className="text-xs text-slate-500">
                  {examTitle} • Mã gốc: {examCode} • {totalQuestions} câu • {durationMinutes} phút
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Test Variant Tabs (101, 102, 103, 104) */}
            <div className="px-6 pt-3 pb-2 border-b border-slate-200 bg-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Mã đề hoán vị:</span>
                {['101', '102', '103', '104'].slice(0, variantCount).map((variant) => (
                  <button
                    key={variant}
                    type="button"
                    onClick={() => setActiveVariantTab(variant)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeVariantTab === variant
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Mã đề {variant}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleExportPDF}
                className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1.5 cursor-pointer underline"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>In đề & Đáp án</span>
              </button>
            </div>

            {/* Questions List preview */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-1">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Trường Đại học Công nghệ — Khoa Công nghệ Thông tin
                </div>
                <div className="text-sm font-bold text-slate-900">{examTitle}</div>
                <div className="text-xs text-slate-600">
                  Mã đề: <strong className="font-bold text-indigo-700">{activeVariantTab}</strong> • Thời gian làm bài: {durationMinutes} phút (Không kể thời gian phát đề)
                </div>
              </div>

              <div className="space-y-3">
                {extractedQuestions.slice(0, 10).map((q, qIndex) => (
                  <div
                    key={q.id}
                    className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-slate-900">
                        Câu {qIndex + 1}: {q.content}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold shrink-0 bg-slate-100 text-slate-600">
                        {BLOOM_3_CONFIG[q.bloom].label}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-2 text-slate-700">
                      {q.options.map((opt, oIdx) => (
                        <div
                          key={oIdx}
                          className={`p-1.5 rounded ${
                            oIdx === q.correctIndex ? 'bg-emerald-50 text-emerald-900 font-semibold' : ''
                          }`}
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {extractedQuestions.length > 10 && (
                  <div className="text-center text-xs text-slate-400 py-2">
                    ... và {extractedQuestions.length - 10} câu hỏi tiếp theo đã được hoán vị ngẫu nhiên.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Đóng
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportPDF}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 cursor-pointer flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải File Word / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveExam}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-white shadow-xs cursor-pointer hover:opacity-90"
                  style={{ backgroundColor: 'var(--primary)' }}
                >
                  Lưu chính thức vào Hệ thống
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamMatrixBuilderPage;
