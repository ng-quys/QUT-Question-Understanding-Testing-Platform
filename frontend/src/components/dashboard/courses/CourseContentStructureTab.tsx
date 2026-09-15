import React, { useState } from 'react';
import {
  FolderTree,
  ChevronDown,
  ChevronRight,
  Plus,
  Edit2,
  Trash2,
  Folder,
  FileText,
  Check,
  X,
  Database,
  Layers,
} from 'lucide-react';
import type{ CourseChapter, CourseTopic } from '../../../types';

interface CourseContentStructureTabProps {
  courseId: string;
  chapters: CourseChapter[];
  onUpdateChapters: (newChapters: CourseChapter[]) => void;
  onShowToast: (msg: string) => void;
  onFilterByTopic?: (topicId: string) => void;
}

export const CourseContentStructureTab: React.FC<CourseContentStructureTabProps> = ({
  courseId,
  chapters,
  onUpdateChapters,
  onShowToast,
  onFilterByTopic,
}) => {
  const [expandedChapterIds, setExpandedChapterIds] = useState<string[]>(
    chapters.map((ch) => ch.id)
  );
  
  // Chapter editing
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editChapterName, setEditChapterName] = useState<string>('');

  // Topic editing
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editTopicName, setEditTopicName] = useState<string>('');

  // Adding new chapter modal / inline
  const [isAddingChapter, setIsAddingChapter] = useState<boolean>(false);
  const [newChapterCode, setNewChapterCode] = useState<string>('');
  const [newChapterName, setNewChapterName] = useState<string>('');

  // Adding new topic modal / inline
  const [addingTopicForChapterId, setAddingTopicForChapterId] = useState<string | null>(null);
  const [newTopicCode, setNewTopicCode] = useState<string>('');
  const [newTopicName, setNewTopicName] = useState<string>('');

  const toggleChapter = (chapId: string) => {
    setExpandedChapterIds((prev) =>
      prev.includes(chapId) ? prev.filter((id) => id !== chapId) : [...prev, chapId]
    );
  };

  const handleStartAddChapter = () => {
    const nextOrder = chapters.length + 1;
    setNewChapterCode(`Chương ${nextOrder}`);
    setNewChapterName('');
    setIsAddingChapter(true);
  };

  const handleSaveAddChapter = () => {
    if (!newChapterName.trim()) {
      onShowToast('Vui lòng nhập tên chương');
      return;
    }
    const newChap: CourseChapter = {
      id: `chap-${courseId}-${Date.now()}`,
      courseId,
      order: chapters.length + 1,
      code: newChapterCode.trim() || `Chương ${chapters.length + 1}`,
      name: newChapterName.trim(),
      topics: [],
    };
    const updated = [...chapters, newChap];
    onUpdateChapters(updated);
    setExpandedChapterIds((prev) => [...prev, newChap.id]);
    setIsAddingChapter(false);
    onShowToast(`Đã thêm ${newChap.code}: ${newChap.name}`);
  };

  const handleDeleteChapter = (chapId: string) => {
    const chap = chapters.find((c) => c.id === chapId);
    if (!chap) return;
    if (chap.topics.length > 0) {
      const confirmDel = window.confirm(
        `Chương này đang có ${chap.topics.length} chủ đề con. Bạn có chắc chắn muốn xóa không?`
      );
      if (!confirmDel) return;
    }
    const updated = chapters.filter((c) => c.id !== chapId);
    onUpdateChapters(updated);
    onShowToast(`Đã xóa ${chap.code}`);
  };

  const handleStartEditChapter = (chap: CourseChapter) => {
    setEditingChapterId(chap.id);
    setEditChapterName(chap.name);
  };

  const handleSaveEditChapter = (chapId: string) => {
    if (!editChapterName.trim()) return;
    const updated = chapters.map((c) =>
      c.id === chapId ? { ...c, name: editChapterName.trim() } : c
    );
    onUpdateChapters(updated);
    setEditingChapterId(null);
    onShowToast('Đã cập nhật tên chương');
  };

  const handleStartAddTopic = (chapter: CourseChapter) => {
    setAddingTopicForChapterId(chapter.id);
    const chapNumber = chapter.order || chapters.indexOf(chapter) + 1;
    const nextSub = chapter.topics.length + 1;
    setNewTopicCode(`${chapNumber}.${nextSub}`);
    setNewTopicName('');
  };

  const handleSaveAddTopic = (chapterId: string) => {
    if (!newTopicName.trim()) {
      onShowToast('Vui lòng nhập tên chủ đề');
      return;
    }
    const newTop: CourseTopic = {
      id: `top-${chapterId}-${Date.now()}`,
      chapterId,
      code: newTopicCode.trim() || `${chapters.find((c) => c.id === chapterId)?.topics.length || 1 + 1}`,
      name: newTopicName.trim(),
      questionCount: 0,
    };
    const updated = chapters.map((c) =>
      c.id === chapterId ? { ...c, topics: [...c.topics, newTop] } : c
    );
    onUpdateChapters(updated);
    setAddingTopicForChapterId(null);
    onShowToast(`Đã thêm chủ đề: ${newTop.code} ${newTop.name}`);
  };

  const handleDeleteTopic = (chapterId: string, topicId: string) => {
    const updated = chapters.map((c) =>
      c.id === chapterId
        ? { ...c, topics: c.topics.filter((t) => t.id !== topicId) }
        : c
    );
    onUpdateChapters(updated);
    onShowToast('Đã xóa chủ đề');
  };

  const handleStartEditTopic = (topic: CourseTopic) => {
    setEditingTopicId(topic.id);
    setEditTopicName(topic.name);
  };

  const handleSaveEditTopic = (chapterId: string, topicId: string) => {
    if (!editTopicName.trim()) return;
    const updated = chapters.map((c) => {
      if (c.id !== chapterId) return c;
      return {
        ...c,
        topics: c.topics.map((t) =>
          t.id === topicId ? { ...t, name: editTopicName.trim() } : t
        ),
      };
    });
    onUpdateChapters(updated);
    setEditingTopicId(null);
    onShowToast('Đã cập nhật chủ đề');
  };

  const totalTopics = chapters.reduce((sum, c) => sum + c.topics.length, 0);

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <FolderTree className="w-4 h-4" style={{ color: 'var(--primary)' }} />
            <span>Cây cấu trúc nội dung học phần (Học phần → Chương → Chủ đề)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Tổng cộng: <strong className="text-slate-800">{chapters.length}</strong> chương,{' '}
            <strong className="text-slate-800">{totalTopics}</strong> chủ đề kiến thức
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleStartAddChapter}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm chương mới</span>
          </button>
        </div>
      </div>

      {/* Add Chapter Inline Box */}
      {isAddingChapter && (
        <div className="p-3.5 rounded-xl border border-slate-300 bg-white shadow-xs space-y-3 animate-in fade-in duration-150">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
            <span>Thêm chương học phần mới</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Mã chương</label>
              <input
                type="text"
                value={newChapterCode}
                onChange={(e) => setNewChapterCode(e.target.value)}
                placeholder="Chương 4"
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tên chương</label>
              <input
                type="text"
                value={newChapterName}
                onChange={(e) => setNewChapterName(e.target.value)}
                placeholder="Ví dụ: Giải thuật sắp xếp và tìm kiếm nâng cao"
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingChapter(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSaveAddChapter}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs cursor-pointer"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              Lưu chương
            </button>
          </div>
        </div>
      )}

      {/* Chapters & Topics Tree */}
      <div className="space-y-3">
        {chapters.map((chapter) => {
          const isExpanded = expandedChapterIds.includes(chapter.id);
          const isEditingChap = editingChapterId === chapter.id;
          const isAddingTopic = addingTopicForChapterId === chapter.id;
          const totalQuestionsInChap = chapter.topics.reduce((acc, t) => acc + (t.questionCount || 0), 0);

          return (
            <div
              key={chapter.id}
              className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden transition-all"
            >
              {/* Chapter Header Row */}
              <div className="p-3 sm:p-3.5 bg-slate-50/80 hover:bg-slate-100/70 border-b border-slate-200/60 flex items-center justify-between gap-3 transition-colors">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleChapter(chapter.id)}
                    className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
                    title={isExpanded ? 'Thu gọn' : 'Mở rộng'}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>

                  <Folder className="w-4 h-4 shrink-0" style={{ color: 'var(--primary)' }} />

                  {isEditingChap ? (
                    <div className="flex items-center gap-2 flex-1 max-w-md">
                      <input
                        type="text"
                        value={editChapterName}
                        onChange={(e) => setEditChapterName(e.target.value)}
                        className="w-full px-2 py-1 text-xs rounded border border-indigo-400 bg-white"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEditChapter(chapter.id)}
                        className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                        title="Lưu"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingChapterId(null)}
                        className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
                        title="Hủy"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-bold text-xs font-mono text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0">
                        {chapter.code}
                      </span>
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {chapter.name}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        ({chapter.topics.length} chủ đề • {totalQuestionsInChap} câu)
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStartAddTopic(chapter)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                    title="Thêm chủ đề con cho chương này"
                  >
                    <Plus className="w-3 h-3" style={{ color: 'var(--primary)' }} />
                    <span className="hidden sm:inline">Thêm chủ đề</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartEditChapter(chapter)}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-white transition-colors cursor-pointer"
                    title="Sửa tên chương"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteChapter(chapter.id)}
                    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Xóa chương"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Topics List Inside Chapter */}
              {isExpanded && (
                <div className="p-2 sm:p-3 space-y-1.5 bg-white">
                  {/* Inline Add Topic Form */}
                  {isAddingTopic && (
                    <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50/30 mb-2 space-y-2">
                      <div className="text-[11px] font-bold text-indigo-900 flex items-center gap-1">
                        <Plus className="w-3 h-3" />
                        <span>Thêm chủ đề mới vào {chapter.code}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <input
                          type="text"
                          value={newTopicCode}
                          onChange={(e) => setNewTopicCode(e.target.value)}
                          placeholder="Mã (VD: 1.3)"
                          className="px-2 py-1 text-xs rounded border border-slate-200 bg-white"
                        />
                        <input
                          type="text"
                          value={newTopicName}
                          onChange={(e) => setNewTopicName(e.target.value)}
                          placeholder="Tên chủ đề kiến thức..."
                          className="sm:col-span-3 px-2 py-1 text-xs rounded border border-slate-200 bg-white"
                        />
                      </div>
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setAddingTopicForChapterId(null)}
                          className="px-2.5 py-1 text-xs rounded border border-slate-200 bg-white text-slate-600"
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveAddTopic(chapter.id)}
                          className="px-3 py-1 text-xs rounded font-bold text-white shadow-xs"
                          style={{ backgroundColor: 'var(--primary)' }}
                        >
                          Lưu chủ đề
                        </button>
                      </div>
                    </div>
                  )}

                  {chapter.topics.length === 0 && !isAddingTopic ? (
                    <div className="py-4 text-center text-xs text-slate-400">
                      Chưa có chủ đề nào trong chương này.{' '}
                      <button
                        type="button"
                        onClick={() => handleStartAddTopic(chapter)}
                        className="font-bold underline ml-1 cursor-pointer"
                        style={{ color: 'var(--primary)' }}
                      >
                        Thêm chủ đề đầu tiên
                      </button>
                    </div>
                  ) : (
                    chapter.topics.map((topic) => {
                      const isEditingTop = editingTopicId === topic.id;

                      return (
                        <div
                          key={topic.id}
                          className="ml-4 sm:ml-6 pl-3 border-l-2 border-slate-200 py-1.5 pr-2 flex items-center justify-between gap-2 hover:bg-slate-50/80 rounded-r-lg group transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono text-[11px] font-bold text-slate-700 shrink-0 bg-slate-100 px-1.5 py-0.5 rounded">
                              {topic.code}
                            </span>

                            {isEditingTop ? (
                              <div className="flex items-center gap-1.5 flex-1 max-w-sm">
                                <input
                                  type="text"
                                  value={editTopicName}
                                  onChange={(e) => setEditTopicName(e.target.value)}
                                  className="w-full px-2 py-0.5 text-xs rounded border border-indigo-400 bg-white"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditTopic(chapter.id, topic.id)}
                                  className="p-0.5 rounded bg-emerald-600 text-white"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingTopicId(null)}
                                  className="p-0.5 rounded bg-slate-200 text-slate-700"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-800 font-medium truncate">
                                {topic.name}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* Question count pill */}
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full border cursor-pointer hover:border-slate-400 transition-colors"
                              style={{
                                backgroundColor: 'var(--primary-light)',
                                color: 'var(--primary)',
                                borderColor: 'var(--primary-border)',
                              }}
                              onClick={() => onFilterByTopic?.(topic.id)}
                              title="Xem các câu hỏi thuộc chủ đề này trong Ngân hàng câu hỏi"
                            >
                              {topic.questionCount || 0} câu
                            </span>

                            <div className="opacity-70 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                              <button
                                type="button"
                                onClick={() => handleStartEditTopic(topic)}
                                className="p-1 rounded text-slate-400 hover:text-slate-700"
                                title="Sửa tên chủ đề"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTopic(chapter.id, topic.id)}
                                className="p-1 rounded text-slate-400 hover:text-rose-600"
                                title="Xóa chủ đề"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
