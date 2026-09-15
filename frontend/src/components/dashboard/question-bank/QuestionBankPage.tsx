import React, { useState, useMemo } from 'react';
import {
  Database,
  Search,
  Filter,
  RotateCcw,
  Plus,
  Sparkles,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  Check,
  X,
  AlertCircle,
  Layers,
  Brain,
  HelpCircle,
} from 'lucide-react';
import {
  QuestionItem,
  Course,
  CourseChapter,
  CourseCLO,
  Bloom3Level,
} from '../../../types';
import { BLOOM_3_CONFIG } from '../../../data/mockAcademicData';
import { QuestionFormModal } from './QuestionFormModal';
import { QuestionBankCard } from './QuestionBankCard';

interface QuestionBankPageProps {
  questions: QuestionItem[];
  courses: Course[];
  chapters: CourseChapter[];
  clos: CourseCLO[];
  onUpdateQuestions: (newQuestions: QuestionItem[]) => void;
  onOpenAIGenerator: () => void;
  onShowToast: (msg: string) => void;
  initialCourseFilter?: string;
  initialTopicFilter?: string;
}

export const QuestionBankPage: React.FC<QuestionBankPageProps> = ({
  questions,
  courses,
  chapters,
  clos,
  onUpdateQuestions,
  onOpenAIGenerator,
  onShowToast,
  initialCourseFilter,
  initialTopicFilter,
}) => {
  // Multi-Filter State
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    initialCourseFilter || 'all'
  );
  const [selectedTopicId, setSelectedTopicId] = useState<string>(
    initialTopicFilter || 'all'
  );
  const [selectedCLOId, setSelectedCLOId] = useState<string>('all');
  const [selectedBloom, setSelectedBloom] = useState<Bloom3Level | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'approved' | 'pending'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Add / Edit Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [questionToEdit, setQuestionToEdit] = useState<QuestionItem | null>(null);

  // Dependent Filter Options:
  // When course is selected, only show topics and CLOs of that course
  const availableChapters = useMemo(() => {
    if (selectedCourseId === 'all') return chapters;
    return chapters.filter((c) => c.courseId === selectedCourseId);
  }, [chapters, selectedCourseId]);

  const availableTopics = useMemo(() => {
    return availableChapters.flatMap((c) => c.topics);
  }, [availableChapters]);

  const availableCLOs = useMemo(() => {
    if (selectedCourseId === 'all') return clos;
    return clos.filter((c) => c.courseId === selectedCourseId);
  }, [clos, selectedCourseId]);

  // Handle Course filter change (reset topic and clo if needed)
  const handleCourseFilterChange = (courseId: string) => {
    setSelectedCourseId(courseId);
    setSelectedTopicId('all');
    setSelectedCLOId('all');
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSelectedCourseId('all');
    setSelectedTopicId('all');
    setSelectedCLOId('all');
    setSelectedBloom('all');
    setSelectedStatus('all');
    setSearchQuery('');
    onShowToast('Đã xóa tất cả bộ lọc');
  };

  // Live AND Multi-filter logic
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      // 1. Course
      if (selectedCourseId !== 'all' && q.courseId !== selectedCourseId) {
        return false;
      }
      // 2. Topic
      if (selectedTopicId !== 'all' && q.topicId !== selectedTopicId) {
        return false;
      }
      // 3. CLO
      if (selectedCLOId !== 'all' && q.cloId !== selectedCLOId) {
        return false;
      }
      // 4. Bloom
      if (selectedBloom !== 'all' && q.bloom !== selectedBloom) {
        return false;
      }
      // 5. Status
      if (selectedStatus !== 'all' && q.status !== selectedStatus) {
        return false;
      }
      // 6. Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchContent = q.content.toLowerCase().includes(query);
        const matchOptions = q.options.some((opt) => opt.toLowerCase().includes(query));
        const matchExplanation = q.explanation ? q.explanation.toLowerCase().includes(query) : false;
        if (!matchContent && !matchOptions && !matchExplanation) {
          return false;
        }
      }
      return true;
    });
  }, [
    questions,
    selectedCourseId,
    selectedTopicId,
    selectedCLOId,
    selectedBloom,
    selectedStatus,
    searchQuery,
  ]);

  // Question Actions
  const handleSaveQuestion = (savedQ: QuestionItem) => {
    if (questionToEdit) {
      onUpdateQuestions(questions.map((q) => (q.id === savedQ.id ? savedQ : q)));
      onShowToast('Đã cập nhật câu hỏi');
    } else {
      onUpdateQuestions([savedQ, ...questions]);
      onShowToast('Đã thêm câu hỏi mới vào ngân hàng');
    }
  };

  const handleDeleteQuestion = (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa câu hỏi này khỏi ngân hàng?')) {
      onUpdateQuestions(questions.filter((q) => q.id !== id));
      onShowToast('Đã xóa câu hỏi');
    }
  };

  const handleApproveQuestion = (id: string) => {
    onUpdateQuestions(
      questions.map((q) => (q.id === id ? { ...q, status: 'approved' as const } : q))
    );
    onShowToast('Đã duyệt câu hỏi vào ngân hàng chính thức');
  };

  const handleRejectQuestion = (id: string) => {
    if (window.confirm('Từ chối và gỡ bỏ câu hỏi AI này?')) {
      onUpdateQuestions(questions.filter((q) => q.id !== id));
      onShowToast('Đã từ chối câu hỏi AI');
    }
  };

  const hasActiveFilters =
    selectedCourseId !== 'all' ||
    selectedTopicId !== 'all' ||
    selectedCLOId !== 'all' ||
    selectedBloom !== 'all' ||
    selectedStatus !== 'all' ||
    searchQuery.trim() !== '';

  const pendingCount = questions.filter((q) => q.status === 'pending').length;

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* 1. TOP HEADER & ACTIONS */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif] flex items-center gap-2">
              <Database className="w-5 h-5" style={{ color: 'var(--primary)' }} />
              <span>Ngân hàng câu hỏi</span>
            </h2>
            {pendingCount > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-600" />
                <span>{pendingCount} chờ duyệt</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý và tra cứu câu hỏi theo mô hình 3 chiều: Chủ đề kiến thức, Chuẩn đầu ra CLO và Thang đo Bloom
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* AI Generator button */}
          <button
            type="button"
            onClick={onOpenAIGenerator}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition-transform active:scale-[0.98] cursor-pointer"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-text)',
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI sinh câu hỏi</span>
          </button>

          {/* Add question button */}
          <button
            type="button"
            onClick={() => {
              setQuestionToEdit(null);
              setIsFormModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white shadow-xs transition-transform active:scale-[0.98] cursor-pointer"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm câu hỏi</span>
          </button>
        </div>
      </div>

      {/* 2. MULTI-DIMENSIONAL FILTER BAR */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
            <Filter className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
            <span>Bộ lọc đa chiều (AND)</span>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Xóa bộ lọc</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* Filter 1: Học phần */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Học phần
            </label>
            <select
              value={selectedCourseId}
              onChange={(e) => handleCourseFilterChange(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-medium focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Tất cả học phần</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter 2: Chương / Chủ đề (phụ thuộc Học phần) */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Chủ đề kiến thức
            </label>
            <select
              value={selectedTopicId}
              onChange={(e) => setSelectedTopicId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-medium focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Tất cả chủ đề</option>
              {availableChapters.map((chap) => (
                <optgroup key={chap.id} label={`${chap.code}: ${chap.name}`}>
                  {chap.topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Filter 3: Chuẩn đầu ra CLO */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Chuẩn đầu ra (CLO)
            </label>
            <select
              value={selectedCLOId}
              onChange={(e) => setSelectedCLOId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-medium focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Tất cả chuẩn CLO</option>
              {availableCLOs.map((clo) => (
                <option key={clo.id} value={clo.id}>
                  {clo.code} ({clo.description.slice(0, 30)}...)
                </option>
              ))}
            </select>
          </div>

          {/* Filter 4: Mức độ Bloom */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Mức độ Bloom
            </label>
            <select
              value={selectedBloom}
              onChange={(e) => setSelectedBloom(e.target.value as Bloom3Level | 'all')}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-medium focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Tất cả mức Bloom</option>
              <option value="remember">Nhận biết (Remember)</option>
              <option value="understand">Thông hiểu (Understand)</option>
              <option value="apply">Vận dụng (Apply)</option>
            </select>
          </div>

          {/* Filter 5: Trạng thái kiểm duyệt */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Trạng thái duyệt
            </label>
            <select
              value={selectedStatus}
              onChange={(e) =>
                setSelectedStatus(e.target.value as 'all' | 'approved' | 'pending')
              }
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-medium focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="approved">Đã duyệt</option>
              <option value="pending">Chờ duyệt (Pending)</option>
            </select>
          </div>
        </div>

        {/* Live Search & Count */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo nội dung câu hỏi, đáp án, giải thích..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="text-xs text-slate-600 font-medium">
            Đã tìm thấy <strong className="text-slate-900 font-bold">{filteredQuestions.length}</strong> câu hỏi phù hợp
          </div>
        </div>
      </div>

      {/* 3. QUESTION LIST (CARD / ROW) */}
      {filteredQuestions.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-xl border border-slate-200 space-y-2">
          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Search className="w-5 h-5" />
          </div>
          <div className="text-sm font-bold text-slate-800">Không tìm thấy câu hỏi phù hợp</div>
          <p className="text-xs text-slate-500">
            Hãy thử thay đổi điều kiện bộ lọc hoặc bấm "Xóa bộ lọc" để hiển thị toàn bộ ngân hàng.
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="mt-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Xóa tất cả bộ lọc
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredQuestions.map((q, idx) => {
            const course = courses.find((c) => c.id === q.courseId);
            const chapter = chapters.find(
              (ch) => ch.topics.some((t) => t.id === q.topicId) || ch.courseId === q.courseId
            );
            const topic = chapters
              .flatMap((ch) => ch.topics)
              .find((t) => t.id === q.topicId);
            const clo = clos.find((c) => c.id === q.cloId);

            return (
              <QuestionBankCard
                key={q.id}
                question={q}
                index={idx}
                course={course}
                chapter={chapter}
                topicName={topic ? `${topic.code} ${topic.name}` : undefined}
                clo={clo}
                onSave={handleSaveQuestion}
                onDelete={handleDeleteQuestion}
                onApprove={handleApproveQuestion}
                onReject={handleRejectQuestion}
                onShowToast={onShowToast}
              />
            );
          })}
        </div>
      )}

      {/* Add / Edit Question Modal */}
      <QuestionFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setQuestionToEdit(null);
        }}
        questionToEdit={questionToEdit}
        courses={courses}
        chapters={chapters}
        clos={clos}
        onSave={handleSaveQuestion}
        defaultCourseId={selectedCourseId !== 'all' ? selectedCourseId : undefined}
        defaultTopicId={selectedTopicId !== 'all' ? selectedTopicId : undefined}
      />
    </div>
  );
};
