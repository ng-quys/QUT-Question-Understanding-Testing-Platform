import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, Plus, Trash2 } from 'lucide-react';
import { CourseChapter, CourseTopic } from '../../../types';

interface KnowledgeUnitSelectorProps {
  chapter: CourseChapter;
  value: string;
  onChange: (name: string) => void;
  onAddNewUnit: (name: string) => void;
  onDeleteUnit: () => void;
  placeholder?: string;
}

export const KnowledgeUnitSelector: React.FC<KnowledgeUnitSelectorProps> = ({
  chapter,
  value,
  onChange,
  onAddNewUnit,
  onDeleteUnit,
  placeholder = '-- Chọn đơn vị --',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const topics: CourseTopic[] = chapter?.topics || [];

  // Match current value with chapter topic if any
  const matchedTopic = topics.find(
    (t) =>
      t.name.toLowerCase() === (value || '').toLowerCase() ||
      `${t.code} ${t.name}`.toLowerCase() === (value || '').toLowerCase() ||
      (value || '').toLowerCase().includes(t.name.toLowerCase())
  );

  // Filter topics by search term
  const filteredTopics = topics.filter((t) => {
    if (!searchTerm.trim()) return true;
    const s = searchTerm.toLowerCase();
    return t.name.toLowerCase().includes(s) || t.code.toLowerCase().includes(s);
  });

  // Handle outside click & escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsAddingNew(false);
        setSearchTerm('');
        setNewUnitName('');
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setIsAddingNew(false);
        setSearchTerm('');
        setNewUnitName('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Auto focus input
  useEffect(() => {
    if (isOpen && !isAddingNew) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, isAddingNew]);

  useEffect(() => {
    if (isAddingNew) {
      setTimeout(() => {
        addInputRef.current?.focus();
      }, 50);
    }
  }, [isAddingNew]);

  const handleSelectTopic = (topic: CourseTopic) => {
    // Normal medium format without badges: e.g. "1.1 Định nghĩa AI & Phân loại tác tử" or just name
    const formatted = topic.code ? `${topic.code} ${topic.name}` : topic.name;
    onChange(formatted);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleConfirmAddNew = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newUnitName.trim();
    if (!trimmed) return;

    onAddNewUnit(trimmed);
    setNewUnitName('');
    setIsAddingNew(false);
    setIsOpen(false);
  };

  return (
    <div className="flex items-center gap-1.5 w-full" ref={containerRef}>
      {/* Dropdown Trigger Button */}
      <div className="relative flex-1 min-w-0">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs text-left bg-white transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-[var(--primary)] ${
            isOpen ? 'border-[var(--primary)] shadow-sm' : 'border-slate-200 hover:border-slate-300'
          }`}
          title={value || placeholder}
        >
          <div className="truncate min-w-0 text-slate-800">
            {value ? (
              <span className="font-medium text-slate-900 text-xs truncate block">{value}</span>
            ) : (
              <span className="text-slate-400 italic text-xs">{placeholder}</span>
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
            {/* Header */}
            <div className="px-3 py-1.5 flex items-center justify-between border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <span>
                Đơn vị kiến thức — {chapter?.code || 'Chương'}
              </span>
              <span className="text-slate-500 font-medium normal-case">
                {topics.length} đơn vị
              </span>
            </div>

            {/* Search Input */}
            <div className="p-1.5 border-b border-slate-100">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm hoặc nhập đơn vị kiến thức..."
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] text-slate-800 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Topics List */}
            <div className="overflow-y-auto custom-scrollbar flex-1 max-h-48 py-1 space-y-0.5">
              {filteredTopics.length > 0 ? (
                filteredTopics.map((topic) => {
                  const topicFull = topic.code ? `${topic.code} ${topic.name}` : topic.name;
                  const isSelected =
                    value?.toLowerCase() === topic.name.toLowerCase() ||
                    value?.toLowerCase() === topicFull.toLowerCase();

                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => handleSelectTopic(topic)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer text-xs ${
                        isSelected
                          ? 'bg-[var(--primary-soft)] text-slate-900 font-semibold'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Normal / medium weight code without prominent badge */}
                        {topic.code && (
                          <span className="text-slate-500 font-medium shrink-0 text-xs">
                            {topic.code}
                          </span>
                        )}
                        <span className="truncate text-slate-800">{topic.name}</span>
                      </div>

                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-3 text-center text-xs text-slate-400 italic">
                  {searchTerm.trim()
                    ? 'Không tìm thấy đơn vị nào. Bạn có thể thêm mới ở bên dưới.'
                    : 'Chương này chưa có danh mục đơn vị kiến thức.'}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-slate-100 my-1" />

            {/* Bottom Add Unit Section */}
            {isAddingNew ? (
              <form onSubmit={handleConfirmAddNew} className="p-2 bg-slate-50 rounded-xl space-y-2">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Tên đơn vị kiến thức:
                </label>
                <input
                  ref={addInputRef}
                  type="text"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  placeholder="Nhập tên đơn vị kiến thức..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNew(false);
                      setNewUnitName('');
                    }}
                    className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 rounded-md cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={!newUnitName.trim()}
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
                onClick={() => {
                  setIsAddingNew(true);
                  if (searchTerm.trim()) {
                    setNewUnitName(searchTerm.trim());
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                style={{ color: 'var(--primary)' }}
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>+ Thêm đơn vị kiến thức mới</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete Unit Button [🗑] */}
      <button
        type="button"
        onClick={onDeleteUnit}
        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-transparent hover:border-rose-200 transition-colors cursor-pointer shrink-0"
        title="Xóa đơn vị kiến thức"
      >
        <Trash2 className="w-4 h-4 text-rose-500" />
      </button>
    </div>
  );
};
