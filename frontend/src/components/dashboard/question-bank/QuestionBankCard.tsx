import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronDown,
  Edit2,
  Trash2,
  Save,
  X,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import type{
  QuestionItem,
  Course,
  CourseChapter,
  CourseCLO,
  Bloom3Level,
} from '../../../types';
import { BLOOM_3_CONFIG } from '../../../data/mockAcademicData';

interface QuestionBankCardProps {
  question: QuestionItem;
  index: number;
  course?: Course;
  chapter?: CourseChapter;
  topicName?: string;
  clo?: CourseCLO;
  onSave: (updatedQuestion: QuestionItem) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onShowToast?: (msg: string) => void;
}

export const QuestionBankCard: React.FC<QuestionBankCardProps> = ({
  question,
  index,
  course,
  chapter,
  topicName,
  clo,
  onSave,
  onDelete,
  onApprove,
  onReject,
  onShowToast,
}) => {
  // State for read-only expanded details ([👁️ Xem chi tiết])
  const [isDetailExpanded, setIsDetailExpanded] = useState<boolean>(false);

  // State for in-line edit mode ([✏️ Sửa])
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // In-line edit draft state
  const [editContent, setEditContent] = useState<string>(question.content);
  const [editOptions, setEditOptions] = useState<string[]>([
    question.options[0] || '',
    question.options[1] || '',
    question.options[2] || '',
    question.options[3] || '',
  ]);
  const [editCorrectIndex, setEditCorrectIndex] = useState<number>(question.correctIndex);
  const [editExplanation, setEditExplanation] = useState<string>(question.explanation || '');
  const [editBloom, setEditBloom] = useState<Bloom3Level>(question.bloom);
  const [formError, setFormError] = useState<string | null>(null);

  const bloomCfg = BLOOM_3_CONFIG[question.bloom];
  const isPending = question.status === 'pending';

  // Breadcrumb identification: [Mã HP - Tên HP] › [Tên Chương / Chủ đề]
  const courseCode = course?.code || 'TI01';
  const courseName = course?.name || 'Học phần';
  const chapterOrTopicName = chapter
    ? `${chapter.code}: ${chapter.name}`
    : topicName || question.aiSuggestedMeta?.topicName || 'Chương chung';

  // Format correct option letter & text
  const correctLetter = String.fromCharCode(65 + question.correctIndex);
  const correctOptionText = question.options[question.correctIndex] || '';

  // Start in-line editing
  const handleStartEdit = () => {
    setEditContent(question.content);
    setEditOptions([
      question.options[0] || '',
      question.options[1] || '',
      question.options[2] || '',
      question.options[3] || '',
    ]);
    setEditCorrectIndex(question.correctIndex);
    setEditExplanation(question.explanation || '');
    setEditBloom(question.bloom);
    setFormError(null);
    setIsEditing(true);
    setIsDetailExpanded(false); // close read-only view if open
  };

  // Cancel in-line editing
  const handleCancelEdit = () => {
    setIsEditing(false);
    setFormError(null);
  };

  // Save changes from in-line editing
  const handleSaveEdit = () => {
    if (!editContent.trim()) {
      setFormError('Nội dung câu hỏi không được để trống.');
      return;
    }

    if (editOptions.some((opt) => !opt.trim())) {
      setFormError('Vui lòng điền đầy đủ nội dung cho cả 4 phương án (A, B, C, D).');
      return;
    }

    const todayStr = new Date().toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const updatedItem: QuestionItem = {
      ...question,
      content: editContent.trim(),
      options: editOptions.map((opt) => opt.trim()),
      correctIndex: editCorrectIndex,
      explanation: editExplanation.trim(),
      bloom: editBloom,
      updatedAt: todayStr,
    };

    onSave(updatedItem);
    setIsEditing(false);
    setFormError(null);
    onShowToast?.('Đã lưu thay đổi câu hỏi thành công!');
  };

  const handleUpdateOptionText = (optIdx: number, val: string) => {
    const next = [...editOptions];
    next[optIdx] = val;
    setEditOptions(next);
  };

  return (
    <div
      id={`question-card-${question.id}`}
      className={`bg-white rounded-xl border transition-all ${
        isEditing
          ? 'border-indigo-400 ring-2 ring-indigo-100 p-4 sm:p-5 shadow-md'
          : isPending
          ? 'border-amber-300 bg-amber-50/15 hover:border-amber-400 p-3 sm:py-2.5 sm:px-4 shadow-2xs'
          : 'border-slate-200 hover:border-slate-300 p-3 sm:py-2.5 sm:px-4 shadow-2xs'
      } space-y-2`}
    >
      {/* ========================================================================= */}
      {/* 1. HEADER NHẬN DIỆN MÔN, CHƯƠNG & CÁC TAG PHÂN LOẠI                     */}
      {/* ========================================================================= */}
      <div
        onClick={() => {
          if (!isEditing) {
            setIsDetailExpanded((prev) => !prev);
          }
        }}
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1.5 border-b border-slate-100 ${
          !isEditing ? 'cursor-pointer hover:bg-slate-50/60 p-1 -m-1 rounded-t-lg transition-colors' : ''
        }`}
        title={!isEditing ? (isDetailExpanded ? 'Nhấn để thu gọn chi tiết' : 'Nhấn để xem chi tiết câu hỏi') : undefined}
      >
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {/* Breadcrumb nhận diện: [Mã HP - Tên HP] › [Tên Chương / Chủ đề] */}
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-100/90 hover:bg-slate-200/80 text-slate-700 border border-slate-200 text-[11px] font-semibold transition-colors truncate max-w-full sm:max-w-md"
            title={`Học phần: ${courseCode} - ${courseName} › ${chapterOrTopicName}`}
          >
            <span className="text-slate-900 font-bold shrink-0">
              [{courseCode} - {courseName}]
            </span>
            <span className="text-slate-400 font-bold shrink-0">›</span>
            <span className="text-slate-700 font-medium truncate">
              [{chapterOrTopicName}]
            </span>
          </div>

          {/* Badge Chuẩn đầu ra CLO */}
          <span
            className="px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono font-bold border shrink-0"
            style={{
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary)',
              borderColor: 'var(--primary-border)',
            }}
            title={clo ? `${clo.code}: ${clo.description}` : 'Chuẩn đầu ra CLO'}
          >
            {clo ? clo.code : question.aiSuggestedMeta?.cloCode || 'CLO'}
          </span>

          {/* Badge Mức nhận thức Bloom */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold border shrink-0 ${bloomCfg.bgClass} ${bloomCfg.textClass} ${bloomCfg.borderClass}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${bloomCfg.dotClass}`} />
            <span>{bloomCfg.label}</span>
          </span>

          {/* Badge Trạng thái: Đã duyệt / Chờ duyệt */}
          {isPending ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
              <Clock className="w-3 h-3 text-amber-600" />
              <span>Chờ duyệt</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
              <Check className="w-3 h-3 text-emerald-600" />
              <span>Đã duyệt</span>
            </span>
          )}

          {/* Tag AI sinh nếu là nguồn AI */}
          {question.source === 'ai' && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-0.5 shrink-0">
              <Sparkles className="w-2.5 h-2.5 text-purple-600" />
              AI sinh
            </span>
          )}

          {/* Tag Điểm mặc định nếu có */}
          {question.default_score !== undefined && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/80 shrink-0">
              {question.default_score}đ
            </span>
          )}
        </div>

        {/* Quick approval buttons for pending questions (if not editing) */}
        {!isEditing && isPending && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 shrink-0 self-end sm:self-auto"
          >
            <button
              type="button"
              onClick={() => onApprove(question.id)}
              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
              title="Duyệt câu hỏi này vào ngân hàng chính thức"
            >
              <Check className="w-3 h-3" />
              <span>Duyệt</span>
            </button>
            <button
              type="button"
              onClick={() => onReject(question.id)}
              className="px-2 py-0.5 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold transition-colors cursor-pointer"
              title="Từ chối câu hỏi AI"
            >
              Từ chối
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. CHẾ ĐỘ CHỈNH SỬA TẠI CHỖ (IN-LINE EDIT / EXPANDED MODE)              */}
      {/* ========================================================================= */}
      {isEditing ? (
        <div className="pt-1 space-y-3 animate-in fade-in duration-150">
          {formError && (
            <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Question Content Editor */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Nội dung câu hỏi <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              placeholder="Nhập nội dung câu hỏi..."
              className="w-full px-3 py-2 text-xs text-slate-900 rounded-lg border border-slate-300 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none leading-relaxed transition-all"
            />
          </div>

          {/* Cognitive Level quick select */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-700">Mức độ Bloom:</span>
            <div className="flex items-center gap-2">
              {(['remember', 'understand', 'apply'] as Bloom3Level[]).map((lvl) => {
                const cfg = BLOOM_3_CONFIG[lvl];
                const isSel = editBloom === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setEditBloom(lvl)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                      isSel
                        ? `${cfg.bgClass} ${cfg.textClass} ${cfg.borderClass} ring-2 ring-offset-1 ring-slate-300`
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4 Options Editor with Radio check for correct option */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-800">
                Các phương án lựa chọn (chọn radio để đánh dấu đáp án đúng): <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">
                Đáp án đúng hiện tại: <strong className="text-emerald-700">[{String.fromCharCode(65 + editCorrectIndex)}]</strong>
              </span>
            </div>

            <div className="space-y-1.5">
              {editOptions.map((optText, oIdx) => {
                const letter = String.fromCharCode(65 + oIdx);
                const isCorrect = editCorrectIndex === oIdx;

                return (
                  <div
                    key={oIdx}
                    onClick={() => setEditCorrectIndex(oIdx)}
                    className={`flex items-center gap-2.5 p-2 rounded-lg border transition-colors cursor-pointer ${
                      isCorrect
                        ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-300'
                        : 'bg-white border-slate-200 hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Radio Button check */}
                    <input
                      type="radio"
                      name={`correct-option-${question.id}`}
                      checked={isCorrect}
                      onChange={() => setEditCorrectIndex(oIdx)}
                      className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                    />

                    {/* Option Letter Badge */}
                    <span
                      className={`w-5 h-5 rounded text-xs font-bold flex items-center justify-center shrink-0 ${
                        isCorrect
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {letter}
                    </span>

                    {/* Option Input Field */}
                    <input
                      type="text"
                      value={optText}
                      onChange={(e) => handleUpdateOptionText(oIdx, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder={`Nội dung phương án ${letter}...`}
                      className={`flex-1 px-2.5 py-1.5 text-xs rounded border outline-none transition-all ${
                        isCorrect
                          ? 'bg-white border-emerald-300 focus:border-emerald-600 font-semibold text-emerald-950'
                          : 'bg-white border-slate-200 focus:border-indigo-600 text-slate-800'
                      }`}
                    />

                    {/* Correct Answer Badge */}
                    {isCorrect && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded shrink-0 hidden sm:inline">
                        ✓ Đáp án đúng
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Explanation Textarea */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              <span>Giải thích chi tiết (tùy chọn):</span>
            </label>
            <textarea
              value={editExplanation}
              onChange={(e) => setEditExplanation(e.target.value)}
              rows={2}
              placeholder="Nhập giải thích vì sao đáp án trên là chính xác..."
              className="w-full px-3 py-2 text-xs text-slate-900 rounded-lg border border-slate-300 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none leading-relaxed transition-all"
            />
          </div>

          {/* Footer of Edit Mode: [Hủy / Đóng] & [💾 Lưu thay đổi] */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Hủy / Đóng</span>
            </button>

            <button
              type="button"
              onClick={handleSaveEdit}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-white text-xs font-bold shadow-xs hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu thay đổi</span>
            </button>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* 3. CHẾ ĐỘ THU GỌN MẶC ĐỊNH (COLLAPSED VIEW - CLASMARKER STYLE)          */
        /* ========================================================================= */
        <>
          {/* Question Content: Clickable row with hover effect and cursor-pointer */}
          <div
            onClick={() => setIsDetailExpanded((prev) => !prev)}
            className="p-2 -mx-2 rounded-lg cursor-pointer hover:bg-slate-50/80 transition-all select-none group"
            title={isDetailExpanded ? 'Nhấn để thu gọn chi tiết' : 'Nhấn để xem chi tiết 4 đáp án và giải thích'}
          >
            <div className="flex items-start justify-between gap-2.5">
              <div
                className={`text-xs sm:text-[13px] font-semibold text-slate-900 leading-snug transition-colors group-hover:text-indigo-950 ${
                  isDetailExpanded ? '' : 'line-clamp-2'
                }`}
              >
                <span className="font-bold text-slate-500 mr-2 shrink-0">Câu {index + 1}.</span>
                <span>{question.content}</span>
              </div>
              <span
                className={`shrink-0 text-slate-400 group-hover:text-indigo-600 p-0.5 rounded transition-transform duration-200 mt-0.5 ${
                  isDetailExpanded ? 'rotate-180 text-indigo-600' : ''
                }`}
              >
                <ChevronDown className="w-4 h-4" />
              </span>
            </div>
          </div>

          {/* Read-Only Expanded View (Shown when isDetailExpanded is true) */}
          {isDetailExpanded && (
            <div className="pt-1 pb-1 space-y-2.5 animate-in fade-in duration-150">
              {/* 4 Options A, B, C, D */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {question.options.map((opt, oIdx) => {
                  const isCorrect = oIdx === question.correctIndex;
                  return (
                    <div
                      key={oIdx}
                      className={`p-2.5 rounded-lg border text-xs leading-snug flex items-start gap-2 transition-colors ${
                        isCorrect
                          ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900 font-semibold ring-1 ring-emerald-200/60'
                          : 'bg-slate-50/70 border-slate-200/80 text-slate-700'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                          isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {String.fromCharCode(65 + oIdx)}
                      </span>
                      <span className="flex-1">{opt}</span>
                      {isCorrect && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Blockquote Giải thích chi tiết */}
              {question.explanation && (
                <blockquote className="my-2 p-3.5 pl-4 pr-3.5 mr-2 bg-slate-50 border-l-4 border-[#e75d0c] rounded-r-lg border-y border-r border-slate-200/60 shadow-2xs">
                  <div className="flex items-center gap-1.5 font-bold italic text-slate-800 text-xs sm:text-[13px] mb-1">
                    <span className="text-[#e75d0c] not-italic">💡</span>
                    <span>Giải thích chi tiết:</span>
                  </div>
                  <p className="text-slate-700 text-xs sm:text-sm leading-relaxed whitespace-pre-line italic">
                    {question.explanation}
                  </p>
                </blockquote>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* 4. FOOTER THẺ CÂU HỎI                                                    */}
          {/* ========================================================================= */}
          <div className="pt-1.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            {/* Góc trái: Ngày cập nhật + Nhãn tóm tắt đáp án đúng nhỏ gọn */}
            <div className="flex items-center flex-wrap gap-2 text-[11px] min-w-0">
              <span className="text-slate-400 shrink-0">
                Cập nhật: {question.updatedAt}
              </span>

              <span className="text-slate-300 hidden sm:inline">•</span>

              {/* Nhãn tóm tắt đáp án đúng nhỏ gọn */}
              <div
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200/90 font-medium text-[11px] max-w-full sm:max-w-md truncate"
                title={`Đáp án đúng: [${correctLetter}] ${correctOptionText}`}
              >
                <span className="font-bold text-emerald-950 shrink-0">Đáp án đúng:</span>
                <span className="font-bold text-emerald-700 shrink-0">[{correctLetter}]</span>
                <span className="truncate text-emerald-900">{correctOptionText}</span>
              </div>
            </div>

            {/* Góc phải: Chỉ giữ lại 2 nút chức năng: [✏️ Sửa] và [🗑 Xóa] */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 self-end sm:self-auto shrink-0"
            >
              {/* Nút [✏️ Sửa] (bung mở rộng in-line editing) */}
              <button
                type="button"
                onClick={handleStartEdit}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border border-slate-200 bg-white hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 text-slate-700 transition-colors cursor-pointer"
                title="Chỉnh sửa câu hỏi trực tiếp"
              >
                <Edit2 className="w-3.5 h-3.5 text-slate-500 hover:text-indigo-600" />
                <span>Sửa</span>
              </button>

              {/* Nút [🗑 Xóa] */}
              <button
                type="button"
                onClick={() => onDelete(question.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-slate-500 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-xs font-semibold transition-colors cursor-pointer"
                title="Xóa câu hỏi khỏi ngân hàng"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-600" />
                <span>Xóa</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
