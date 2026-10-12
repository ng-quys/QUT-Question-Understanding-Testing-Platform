import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Plus, Trash2, BookOpen } from 'lucide-react';
import { CourseChapter } from '../../../types';

interface ChapterSelectorProps {
  currentChapter: CourseChapter;
  allChapters: CourseChapter[];
  onSelectChapter: (chapterId: string) => void;
  onAddNewChapter: (chapterName: string) => void;
  onDeleteChapter: () => void;
}

export const ChapterSelector: React.FC<ChapterSelectorProps> = ({
  currentChapter,
  allChapters,
  onSelectChapter,
  onAddNewChapter,
  onDeleteChapter,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newChapterName, setNewChapterName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsAddingNew(false);
        setNewChapterName('');
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setIsAddingNew(false);
        setNewChapterName('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Auto focus input when opening new chapter input
  useEffect(() => {
    if (isAddingNew) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isAddingNew]);

  const handleConfirmAddNew = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newChapterName.trim();
    if (!trimmed) return;

    onAddNewChapter(trimmed);
    setNewChapterName('');
    setIsAddingNew(false);
    setIsOpen(false);
  };

  return (
    <div className="flex items-center gap-1.5 w-full" ref={containerRef}>
      {/* Chapter Dropdown Trigger */}
      <div className="relative flex-1 min-w-0">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs text-left bg-white transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-[var(--primary)] ${
            isOpen ? 'border-[var(--primary)] shadow-sm' : 'border-slate-200 hover:border-slate-300'
          }`}
          title={currentChapter ? `${currentChapter.code}: ${currentChapter.name}` : '-- Chọn chương --'}
        >
          <div className="truncate font-medium text-slate-800 flex items-center gap-1.5 min-w-0">
            {currentChapter ? (
              <span className="truncate">
                {currentChapter.code ? `${currentChapter.code}: ` : ''}
                {currentChapter.name}
              </span>
            ) : (
              <span className="text-slate-400 italic">-- Chọn chương --</span>
            )}
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
              isOpen ? 'rotate-180 text-[var(--primary)]' : ''
            }`}
          />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute left-0 z-40 mt-1.5 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-100 max-h-80 flex flex-col">
            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
              Danh sách chương / chủ đề ({allChapters.length})
            </div>

            {/* Chapters list */}
            <div className="overflow-y-auto custom-scrollbar max-h-52 py-1 space-y-0.5">
              {allChapters.map((chap) => {
                const isSelected = chap.id === currentChapter?.id;
                return (
                  <button
                    key={chap.id}
                    type="button"
                    onClick={() => {
                      onSelectChapter(chap.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--primary-soft)] text-slate-900 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">
                      {chap.code ? `${chap.code}: ` : ''}
                      {chap.name}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div className="border-t border-slate-100 my-1" />

            {/* Add new chapter footer item */}
            {isAddingNew ? (
              <form onSubmit={handleConfirmAddNew} className="p-2 bg-slate-50 rounded-xl space-y-2">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Tên chương / chủ đề mới:
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={newChapterName}
                  onChange={(e) => setNewChapterName(e.target.value)}
                  placeholder="Ví dụ: Chương 4: Xử lý ngôn ngữ tự nhiên"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNew(false);
                      setNewChapterName('');
                    }}
                    className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 rounded-md cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={!newChapterName.trim()}
                    className="px-3 py-1 text-xs font-bold text-white rounded-md shadow-2xs hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    style={{ backgroundColor: 'var(--primary)' }}
                  >
                    Thêm
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingNew(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                style={{ color: 'var(--primary)' }}
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>+ Thêm chương / chủ đề mới</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete Chapter Button [🗑] */}
      <button
        type="button"
        onClick={onDeleteChapter}
        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-transparent hover:border-rose-200 transition-colors cursor-pointer shrink-0"
        title="Xóa toàn bộ mục này"
      >
        <Trash2 className="w-4 h-4 text-rose-500" />
      </button>
    </div>
  );
};
