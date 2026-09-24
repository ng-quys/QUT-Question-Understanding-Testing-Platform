import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Check,
  BookOpen,
  Layers,
  Sparkles,
  HelpCircle,
  Brain,
  FolderTree,
} from 'lucide-react';
import type{ QuestionItem, Course, CourseChapter, CourseCLO, Bloom3Level } from '../../../types';
import { BLOOM_3_CONFIG } from '../../../data/mockAcademicData';

interface QuestionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  questionToEdit?: QuestionItem | null;
  courses: Course[];
  chapters: CourseChapter[];
  clos: CourseCLO[];
  onSave: (question: QuestionItem) => void;
  defaultCourseId?: string;
  defaultTopicId?: string;
}

export const QuestionFormModal: React.FC<QuestionFormModalProps> = ({
  isOpen,
  onClose,
  questionToEdit,
  courses,
  chapters,
  clos,
  onSave,
  defaultCourseId,
  defaultTopicId,
}) => {
  // Course selection
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    questionToEdit?.courseId || defaultCourseId || (courses[0]?.id ?? '')
  );

  // Filter chapters for this course
  const courseChapters = chapters.filter((c) => c.courseId === selectedCourseId);
  const allCourseTopics = courseChapters.flatMap((c) => c.topics);

  // Topic selection
  const [selectedTopicId, setSelectedTopicId] = useState<string>(
    questionToEdit?.topicId || defaultTopicId || (allCourseTopics[0]?.id ?? '')
  );

  // CLO selection
  const courseCLOs = clos.filter((c) => c.courseId === selectedCourseId);
  const [selectedCLOId, setSelectedCLOId] = useState<string>(
    questionToEdit?.cloId || (courseCLOs[0]?.id ?? '')
  );

  // Bloom selection
  const [selectedBloom, setSelectedBloom] = useState<Bloom3Level>(
    questionToEdit?.bloom || 'understand'
  );

  // Content, options, explanation
  const [content, setContent] = useState<string>(questionToEdit?.content || '');
  const [options, setOptions] = useState<string[]>(
    questionToEdit?.options || ['', '', '', '']
  );
  const [correctIndex, setCorrectIndex] = useState<number>(
    questionToEdit?.correctIndex ?? 0
  );
  const [explanation, setExplanation] = useState<string>(
    questionToEdit?.explanation || ''
  );
  const [status, setStatus] = useState<'approved' | 'pending'>(
    questionToEdit?.status === 'pending' ? 'pending' : 'approved'
  );

  // Keep topic and CLO synced when course changes
  useEffect(() => {
    if (questionToEdit) {
      setSelectedCourseId(questionToEdit.courseId);
      setSelectedTopicId(questionToEdit.topicId);
      setSelectedCLOId(questionToEdit.cloId);
      setSelectedBloom(questionToEdit.bloom);
      setContent(questionToEdit.content);
      setOptions(questionToEdit.options);
      setCorrectIndex(questionToEdit.correctIndex);
      setExplanation(questionToEdit.explanation || '');
      setStatus(questionToEdit.status === 'pending' ? 'pending' : 'approved');
    } else {
      const initCourseId = defaultCourseId || (courses[0]?.id ?? '');
      setSelectedCourseId(initCourseId);
      const chaps = chapters.filter((c) => c.courseId === initCourseId);
      const tops = chaps.flatMap((c) => c.topics);
      setSelectedTopicId(defaultTopicId || (tops[0]?.id ?? ''));
      const cClos = clos.filter((c) => c.courseId === initCourseId);
      setSelectedCLOId(cClos[0]?.id ?? '');
      setSelectedBloom('understand');
      setContent('');
      setOptions(['', '', '', '']);
      setCorrectIndex(0);
      setExplanation('');
      setStatus('approved');
    }
  }, [questionToEdit, isOpen, defaultCourseId, defaultTopicId]);

  if (!isOpen) return null;

  const handleCourseChange = (newCourseId: string) => {
    setSelectedCourseId(newCourseId);
    const chaps = chapters.filter((c) => c.courseId === newCourseId);
    const tops = chaps.flatMap((c) => c.topics);
    if (tops.length > 0) setSelectedTopicId(tops[0].id);
    const cClos = clos.filter((c) => c.courseId === newCourseId);
    if (cClos.length > 0) setSelectedCLOId(cClos[0].id);
  };

  const handleOptionChange = (idx: number, val: string) => {
    const next = [...options];
    next[idx] = val;
    setOptions(next);
  };

  // Find parent chapter of current selected topic
  const currentChapter = courseChapters.find((c) =>
    c.topics.some((t) => t.id === selectedTopicId)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      alert('Vui lòng nhập nội dung câu hỏi');
      return;
    }
    if (options.some((opt) => !opt.trim())) {
      alert('Vui lòng điền đủ nội dung cho 4 đáp án');
      return;
    }

    const chapId = currentChapter?.id || (courseChapters[0]?.id ?? '');

    const savedQuestion: QuestionItem = {
      id: questionToEdit ? questionToEdit.id : `q-${Date.now()}`,
      courseId: selectedCourseId,
      chapterId: chapId,
      topicId: selectedTopicId,
      cloId: selectedCLOId,
      bloom: selectedBloom,
      content: content.trim(),
      options: options.map((opt) => opt.trim()),
      correctIndex,
      explanation: explanation.trim(),
      status,
      source: questionToEdit ? questionToEdit.source : 'manual',
      updatedAt: 'Hôm nay',
    };

    onSave(savedQuestion);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl p-5 sm:p-6 shadow-2xl border border-slate-200 z-10 max-h-[92vh] flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif]">
              {questionToEdit ? 'Chỉnh sửa câu hỏi' : 'Thêm câu hỏi trắc nghiệm mới'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Định danh câu hỏi đa chiều: Chủ đề kiến thức + Chuẩn đầu ra CLO + Mức độ nhận thức Bloom
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-3 space-y-4 pr-1 text-xs">
          {/* 1. KHỐI PHÂN LOẠI ĐA CHIỀU (BẮT BUỘC 3 TRƯỜNG ĐỘC LẬP) */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
              <Brain className="w-4 h-4" style={{ color: 'var(--primary)' }} />
              <span>Phân loại đa chiều (Chủ đề + CLO + Bloom)</span>
            </div>

            {/* Selector 1: Học phần & Chủ đề kiến thức có Breadcrumbs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Học phần <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => handleCourseChange(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 bg-white font-medium"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Chủ đề kiến thức (Cây phân cấp) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedTopicId}
                  onChange={(e) => setSelectedTopicId(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 bg-white font-medium"
                >
                  {courseChapters.map((chap) => (
                    <optgroup key={chap.id} label={`${chap.code}: ${chap.name}`}>
                      {chap.topics.map((top) => (
                        <option key={top.id} value={top.id}>
                          {top.code} {top.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {/* Breadcrumb visual */}
                {currentChapter && (
                  <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                    <span className="font-semibold">{courses.find((c) => c.id === selectedCourseId)?.code}</span>
                    <span>/</span>
                    <span>{currentChapter.code}</span>
                    <span>/</span>
                    <span className="font-semibold text-slate-700">
                      {allCourseTopics.find((t) => t.id === selectedTopicId)?.code}{' '}
                      {allCourseTopics.find((t) => t.id === selectedTopicId)?.name}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Selector 2: Chuẩn đầu ra CLO */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Chuẩn đầu ra (CLO) <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedCLOId}
                onChange={(e) => setSelectedCLOId(e.target.value)}
                className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 bg-white font-medium"
              >
                {courseCLOs.map((clo) => (
                  <option key={clo.id} value={clo.id}>
                    {clo.code} — {clo.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Selector 3: Mức độ nhận thức Bloom (3 mức: Nhận biết, Thông hiểu, Vận dụng) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                Mức độ nhận thức Bloom <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['remember', 'understand', 'apply'] as Bloom3Level[]).map((lvl) => {
                  const cfg = BLOOM_3_CONFIG[lvl];
                  const isSelected = selectedBloom === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSelectedBloom(lvl)}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        isSelected
                          ? `${cfg.bgClass} ${cfg.textClass} ${cfg.borderClass} ring-2 ring-indigo-500/20 shadow-xs`
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-xs font-bold">{cfg.label}</div>
                      <div className="text-[10px] opacity-75">{cfg.subLabel}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. NỘI DUNG CÂU HỎI */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Nội dung câu hỏi <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Nhập nội dung câu hỏi trắc nghiệm..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* 3. BỐN ĐÁP ÁN LỰA CHỌN */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              Các phương án trả lời (Chọn nút tròn để chỉ định đáp án đúng) <span className="text-rose-500">*</span>
            </label>
            <div className="space-y-2">
              {['A', 'B', 'C', 'D'].map((letter, idx) => {
                const isCorrect = correctIndex === idx;
                return (
                  <div
                    key={letter}
                    className={`flex items-center gap-2 p-2 rounded-xl border transition-colors ${
                      isCorrect
                        ? 'bg-emerald-50/70 border-emerald-300'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <label className="flex items-center gap-2 cursor-pointer shrink-0">
                      <input
                        type="radio"
                        name="correctAnswerOption"
                        checked={isCorrect}
                        onChange={() => setCorrectIndex(idx)}
                        className="accent-emerald-600 w-4 h-4 cursor-pointer"
                      />
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ${
                          isCorrect
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {letter}
                      </span>
                    </label>

                    <input
                      type="text"
                      value={options[idx] || ''}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Nội dung đáp án ${letter}...`}
                      className="flex-1 px-2.5 py-1.5 text-xs bg-transparent border-0 focus:outline-none"
                    />

                    {isCorrect && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
                        Đáp án đúng
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. LỜI GIẢI / GIẢI THÍCH CHI TIẾT */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Lời giải thích chi tiết (Hiển thị khi sinh viên xem lại bài làm)
            </label>
            <textarea
              rows={2}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Giải thích nguyên nhân vì sao đáp án này là chính xác..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* 5. TRẠNG THÁI KIỂM DUYỆT */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <div className="text-xs font-bold text-slate-800">Trạng thái câu hỏi</div>
              <div className="text-[11px] text-slate-500">
                Chỉ các câu hỏi ở trạng thái "Đã duyệt" mới được sử dụng để sinh đề thi theo ma trận.
              </div>
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'approved' | 'pending')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white"
            >
              <option value="approved">Đã duyệt (Sẵn sàng tạo đề)</option>
              <option value="pending">Chờ duyệt (Bản nháp / AI sinh)</option>
            </select>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition-transform active:scale-[0.98] cursor-pointer"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              {questionToEdit ? 'Lưu cập nhật' : 'Thêm vào ngân hàng'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
