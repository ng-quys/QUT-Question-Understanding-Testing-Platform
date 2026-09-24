import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Edit2,
  Trash2,
  Sparkles,
  FileText,
  BookOpen,
  ArrowLeft,
  Plus,
  Save,
  Check,
  RotateCcw,
} from 'lucide-react';
import {
  QuestionItem,
  Course,
  CourseChapter,
  CourseCLO,
  Bloom3Level,
  SourceDocument,
} from '../../../types';
import { BLOOM_3_CONFIG } from '../../../data/mockAcademicData';

interface QuestionReviewStepProps {
  questions: QuestionItem[];
  documents: SourceDocument[];
  courses: Course[];
  chapters: CourseChapter[];
  clos: CourseCLO[];
  onUpdateQuestion: (id: string, updates: Partial<QuestionItem>) => void;
  onDeleteQuestion: (id: string) => void;
  onSaveAll: (status: 'pending' | 'approved') => void;
  onGenerateMore: () => void;
  onNewDocuments: () => void;
}

export const QuestionReviewStep: React.FC<QuestionReviewStepProps> = ({
  questions,
  documents,
  courses,
  chapters,
  clos,
  onUpdateQuestion,
  onDeleteQuestion,
  onSaveAll,
  onGenerateMore,
  onNewDocuments,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Edit draft states
  const [editContent, setEditContent] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editCorrectIndex, setEditCorrectIndex] = useState<number>(0);
  const [editExplanation, setEditExplanation] = useState('');

  const startEditing = (q: QuestionItem) => {
    setEditingId(q.id);
    setEditContent(q.content);
    setEditOptions([...q.options]);
    setEditCorrectIndex(q.correctIndex);
    setEditExplanation(q.explanation || '');
  };

  const saveEditing = (id: string) => {
    onUpdateQuestion(id, {
      content: editContent,
      options: editOptions,
      correctIndex: editCorrectIndex,
      explanation: editExplanation,
    });
    setEditingId(null);
  };

  const handleBatchSave = (status: 'pending' | 'approved') => {
    setIsSaving(true);
    setTimeout(() => {
      onSaveAll(status);
      setIsSaving(false);
    }, 400);
  };

  return (
    <div className="space-y-4">
      {/* Top Banner: Status & Overview */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl text-white flex items-center justify-center shadow-xs flex-shrink-0"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif] flex items-center gap-2">
              <span>Kiểm duyệt câu hỏi do AI sinh</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                {questions.length} câu • Trạng thái mặc định: Chờ duyệt
              </span>
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
              <span>Nguồn tài liệu:</span>
              {documents.map((d) => (
                <span
                  key={d.id}
                  className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-[11px]"
                >
                  <FileText className="w-3 h-3 text-slate-400" />
                  {d.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onGenerateMore}
            className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Sinh thêm</span>
          </button>
          <button
            type="button"
            onClick={onNewDocuments}
            className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-slate-500" />
            <span>Tài liệu mới</span>
          </button>
        </div>
      </div>

      {/* Questions Review List */}
      <div className="space-y-3">
        {questions.map((q, idx) => {
          const isCurrentEditing = editingId === q.id;
          const bloomCfg = BLOOM_3_CONFIG[q.bloom];
          const course = courses.find((c) => c.id === q.courseId);
          const courseClos = clos.filter((c) => c.courseId === q.courseId);
          const activeClo = clos.find((c) => c.id === q.cloId);

          return (
            <div
              key={q.id}
              className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3 hover:border-slate-300 transition-colors"
            >
              {/* Question Metadata Header */}
              <div className="flex items-center justify-between gap-2 flex-wrap pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                    Câu {idx + 1}
                  </span>

                  {/* Bloom Selector */}
                  <select
                    value={q.bloom}
                    onChange={(e) =>
                      onUpdateQuestion(q.id, { bloom: e.target.value as Bloom3Level })
                    }
                    className={`px-2 py-0.5 text-[11px] rounded-full font-semibold border ${bloomCfg.bgClass} ${bloomCfg.textClass} ${bloomCfg.borderClass} cursor-pointer`}
                  >
                    <option value="remember">Nhận biết</option>
                    <option value="understand">Thông hiểu</option>
                    <option value="apply">Vận dụng</option>
                  </select>

                  {/* CLO Selector */}
                  <select
                    value={q.cloId}
                    onChange={(e) => onUpdateQuestion(q.id, { cloId: e.target.value })}
                    className="px-2 py-0.5 text-[11px] rounded font-mono font-semibold border border-slate-200 bg-slate-50 text-slate-700 cursor-pointer"
                  >
                    {courseClos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code}
                      </option>
                    ))}
                  </select>

                  {/* Source Document Tag */}
                  {q.aiSuggestedMeta?.sourceDocumentName && (
                    <span
                      className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1 border border-slate-200"
                      title="Tài liệu nguồn trích xuất câu hỏi này"
                    >
                      <FileText className="w-2.5 h-2.5 text-slate-400" />
                      <span className="max-w-[150px] truncate">
                        {q.aiSuggestedMeta.sourceDocumentName}
                      </span>
                    </span>
                  )}

                  {/* Default Score Badge */}
                  {q.default_score !== undefined && (
                    <span
                      className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200/80"
                      title="Điểm số mặc định của câu hỏi"
                    >
                      {q.default_score} điểm
                    </span>
                  )}
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      q.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {q.status === 'approved' ? 'Đã duyệt' : 'Chờ duyệt'}
                  </span>

                  {isCurrentEditing ? (
                    <button
                      type="button"
                      onClick={() => saveEditing(q.id)}
                      className="p-1 rounded-md text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                      title="Lưu chỉnh sửa"
                    >
                      <Save className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditing(q)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                      title="Chỉnh sửa nội dung & đáp án"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onDeleteQuestion(q.id)}
                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    title="Xóa câu hỏi này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Question Body */}
              {isCurrentEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Nội dung câu hỏi
                    </label>
                    <textarea
                      rows={3}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Options Editing */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-700">
                      Các phương án lựa chọn (Chọn phương án đúng)
                    </label>
                    {editOptions.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${q.id}`}
                          checked={editCorrectIndex === oIdx}
                          onChange={() => setEditCorrectIndex(oIdx)}
                          className="w-3.5 h-3.5 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-xs font-bold text-slate-600 w-4">
                          {String.fromCharCode(65 + oIdx)}.
                        </span>
                        <input
                          type="text"
                          value={opt.replace(/^[A-D]\.\s*/, '')}
                          onChange={(e) => {
                            const prefix = `${String.fromCharCode(65 + oIdx)}. `;
                            const newOpts = [...editOptions];
                            newOpts[oIdx] = prefix + e.target.value;
                            setEditOptions(newOpts);
                          }}
                          className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-200"
                        />
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Lời giải thích chi tiết
                    </label>
                    <textarea
                      rows={2}
                      value={editExplanation}
                      onChange={(e) => setEditExplanation(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="text-xs font-semibold text-slate-900 leading-relaxed">
                    {q.content}
                  </div>

                  <div className="grid grid-cols-1 gap-1.5">
                    {q.options.map((opt, oIdx) => {
                      const isCorrect = oIdx === q.correctIndex;
                      return (
                        <div
                          key={oIdx}
                          className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between border ${
                            isCorrect
                              ? 'bg-emerald-50 text-emerald-950 font-semibold border-emerald-200'
                              : 'bg-slate-50/70 text-slate-700 border-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-500">
                              {String.fromCharCode(65 + oIdx)}.
                            </span>
                            <span>{opt.replace(/^[A-D]\.\s*/, '')}</span>
                          </div>
                          {isCorrect && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                              Đáp án đúng
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {q.explanation && (
                    <div className="p-2.5 rounded-lg bg-amber-50/40 text-[11px] text-amber-900 border border-amber-200/60 leading-relaxed">
                      💡 <strong>Giải thích chuyên môn:</strong> {q.explanation}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Step 5: Save & Final Actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex items-center justify-between flex-wrap gap-3">
        <div className="text-xs text-slate-500">
          Tổng số: <strong className="text-slate-800">{questions.length}</strong> câu hỏi sẵn sàng lưu vào hệ thống
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isSaving || questions.length === 0}
            onClick={() => handleBatchSave('pending')}
            className="px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold cursor-pointer transition-colors shadow-2xs"
          >
            {isSaving ? 'Đang lưu...' : 'Lưu tất cả vào mục "Chờ duyệt"'}
          </button>

          <button
            type="button"
            disabled={isSaving || questions.length === 0}
            onClick={() => handleBatchSave('approved')}
            className="px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-xs cursor-pointer hover:opacity-95 active:scale-[0.98] transition-all flex items-center gap-1.5"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <Check className="w-4 h-4" />
            <span>{isSaving ? 'Đang lưu...' : 'Duyệt & Thêm vào ngân hàng chính thức'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
