import React, { useState } from 'react';
import { X, FolderPlus, FilePlus2, Check } from 'lucide-react';
import { CourseChapter } from '../../../types';

interface AddChapterTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseChapters: CourseChapter[];
  onAddChapter: (name: string, order: number) => void;
  onAddTopic: (chapterId: string, name: string) => void;
}

export const AddChapterTopicModal: React.FC<AddChapterTopicModalProps> = ({
  isOpen,
  onClose,
  courseChapters,
  onAddChapter,
  onAddTopic,
}) => {
  const [mode, setMode] = useState<'chapter' | 'topic'>('chapter');

  // Chapter form states
  const [chapterName, setChapterName] = useState('');
  const [chapterOrder, setChapterOrder] = useState<number>(courseChapters.length + 1);

  // Topic form states
  const [selectedParentChapterId, setSelectedParentChapterId] = useState<string>(
    courseChapters[0]?.id || ''
  );
  const [topicName, setTopicName] = useState('');

  if (!isOpen) return null;

  const handleSubmitChapter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chapterName.trim()) return;
    onAddChapter(chapterName.trim(), Number(chapterOrder) || courseChapters.length + 1);
    setChapterName('');
    onClose();
  };

  const handleSubmitTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicName.trim() || !selectedParentChapterId) return;
    onAddTopic(selectedParentChapterId, topicName.trim());
    setTopicName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Thêm chương hoặc chủ đề mới</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Bổ sung cấu trúc vào ma trận học phần đang chọn
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="p-5 pb-2">
          <label className="block text-xs font-semibold text-slate-700 mb-2">
            Bạn muốn thêm gì?
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('chapter')}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                mode === 'chapter'
                  ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] shadow-2xs ring-1 ring-[var(--primary)]'
                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
              }`}
            >
              <FolderPlus className="w-4 h-4" />
              <span>Chương mới</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('topic')}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                mode === 'topic'
                  ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] shadow-2xs ring-1 ring-[var(--primary)]'
                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
              }`}
            >
              <FilePlus2 className="w-4 h-4" />
              <span>Chủ đề / Đơn vị mới</span>
            </button>
          </div>
        </div>

        {/* Forms */}
        {mode === 'chapter' ? (
          <form onSubmit={handleSubmitChapter} className="p-5 pt-3 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tên chương <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                autoFocus
                value={chapterName}
                onChange={(e) => setChapterName(e.target.value)}
                placeholder="Ví dụ: Cơ sở dữ liệu phân tán & NoSQL"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Thứ tự hiển thị
              </label>
              <input
                type="number"
                min={1}
                value={chapterOrder}
                onChange={(e) => setChapterOrder(parseInt(e.target.value, 10) || 1)}
                className="w-24 px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] focus:outline-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={!chapterName.trim()}
                className="px-4 py-2 text-xs font-bold text-white rounded-xl shadow-2xs hover:opacity-90 disabled:opacity-40 cursor-pointer"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                Tạo chương
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmitTopic} className="p-5 pt-3 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Chương trực thuộc <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedParentChapterId}
                onChange={(e) => setSelectedParentChapterId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] focus:outline-none"
              >
                {courseChapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}: {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tên chủ đề / Đơn vị kiến thức <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                autoFocus
                value={topicName}
                onChange={(e) => setTopicName(e.target.value)}
                placeholder="Ví dụ: Phân giải tên miền DNS & Caching"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] focus:outline-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={!topicName.trim() || !selectedParentChapterId}
                className="px-4 py-2 text-xs font-bold text-white rounded-xl shadow-2xs hover:opacity-90 disabled:opacity-40 cursor-pointer"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                Tạo chủ đề
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
