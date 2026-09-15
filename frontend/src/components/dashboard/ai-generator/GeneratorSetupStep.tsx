import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  FileText,
  Layers,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Tag,
  HelpCircle,
  Hash,
  ChevronDown,
  Plus,
  Check,
  FolderTree,
  X,
} from 'lucide-react';
import {
  Course,
  CourseChapter,
  CourseTopic,
  CourseCLO,
  Bloom3Level,
  SourceDocument,
  DocumentExtractionSummary,
  AIGeneratorConfig,
} from '../../../types';
import { BLOOM_3_CONFIG } from '../../../data/mockAcademicData';

interface GeneratorSetupStepProps {
  documents: SourceDocument[];
  extractionSummary: DocumentExtractionSummary | null;
  courses: Course[];
  chapters: CourseChapter[];
  clos: CourseCLO[];
  initialConfig?: Partial<AIGeneratorConfig>;
  onBack: () => void;
  onSubmitSetup: (config: AIGeneratorConfig) => void;
  onUpdateCourses?: (courses: Course[]) => void;
  onUpdateChapters?: (chapters: CourseChapter[]) => void;
  onShowToast?: (message: string) => void;
}

export const GeneratorSetupStep: React.FC<GeneratorSetupStepProps> = ({
  documents,
  extractionSummary,
  courses,
  chapters,
  clos,
  initialConfig,
  onBack,
  onSubmitSetup,
  onUpdateCourses,
  onUpdateChapters,
  onShowToast,
}) => {
  // Course Selection State
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    initialConfig?.courseId || courses[0]?.id || ''
  );

  const courseChapters = chapters.filter((c) => c.courseId === selectedCourseId);
  const allCourseTopics = courseChapters.flatMap((c) => c.topics);
  const courseCLOs = clos.filter((c) => c.courseId === selectedCourseId);

  // Topic / Chapter Selection State
  const [selectedTopicId, setSelectedTopicId] = useState<string>(
    initialConfig?.topicId || allCourseTopics[0]?.id || courseChapters[0]?.id || ''
  );
  const [selectedCLOId, setSelectedCLOId] = useState<string>(
    initialConfig?.cloId || courseCLOs[0]?.id || ''
  );
  const [selectedBloom, setSelectedBloom] = useState<Bloom3Level>(
    initialConfig?.bloom || 'understand'
  );
  const [questionCount, setQuestionCount] = useState<number>(
    initialConfig?.questionCount || 3
  );
  const [promptNotes, setPromptNotes] = useState<string>(
    initialConfig?.promptNotes ||
      'Tập trung khai thác các mệnh đề định nghĩa, so sánh chi phí tính toán và các trường hợp đặc biệt được nêu trong tài liệu.'
  );

  // Dropdown open states
  const [isCourseDropdownOpen, setIsCourseDropdownOpen] = useState(false);
  const [isTopicDropdownOpen, setIsTopicDropdownOpen] = useState(false);

  // Modal 1: Add new course state
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseName, setNewCourseName] = useState('');

  // Modal 2: Add chapter or topic state
  // addTypeSelection: 'choose' (asking what to add) | 'chapter' (form chapter) | 'topic' (form topic)
  const [isAddChapterOrTopicModalOpen, setIsAddChapterOrTopicModalOpen] = useState(false);
  const [addTypeSelection, setAddTypeSelection] = useState<'choose' | 'chapter' | 'topic'>('choose');

  // Form Chapter state
  const [newChapterName, setNewChapterName] = useState('');

  // Form Topic state
  const [targetChapterIdForTopic, setTargetChapterIdForTopic] = useState('');
  const [newTopicName, setNewTopicName] = useState('');

  // Refs for outside-click detection
  const courseDropdownRef = useRef<HTMLDivElement>(null);
  const topicDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        courseDropdownRef.current &&
        !courseDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCourseDropdownOpen(false);
      }
      if (
        topicDropdownRef.current &&
        !topicDropdownRef.current.contains(event.target as Node)
      ) {
        setIsTopicDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCourseDropdownOpen(false);
        setIsTopicDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Sync selected target chapter when course changes or modal opens
  useEffect(() => {
    if (courseChapters.length > 0) {
      // Find current chapter if topic selected, or default to first
      const currentChap = courseChapters.find(
        (c) => c.topics.some((t) => t.id === selectedTopicId) || c.id === selectedTopicId
      );
      setTargetChapterIdForTopic(currentChap ? currentChap.id : courseChapters[0].id);
    }
  }, [selectedCourseId, selectedTopicId, courseChapters.length]);

  // Switch Course
  const handleSelectCourse = (cId: string) => {
    setSelectedCourseId(cId);
    setIsCourseDropdownOpen(false);

    const chaps = chapters.filter((c) => c.courseId === cId);
    const tops = chaps.flatMap((c) => c.topics);
    if (tops.length > 0) {
      setSelectedTopicId(tops[0].id);
    } else if (chaps.length > 0) {
      setSelectedTopicId(chaps[0].id);
    } else {
      setSelectedTopicId('');
    }

    const cClos = clos.filter((c) => c.courseId === cId);
    if (cClos.length > 0) {
      setSelectedCLOId(cClos[0].id);
    } else {
      setSelectedCLOId('');
    }
  };

  // Find active items for labels
  const selectedCourse = courses.find((c) => c.id === selectedCourseId);
  const activeTopic = allCourseTopics.find((t) => t.id === selectedTopicId);
  const activeChapter = courseChapters.find(
    (c) => c.topics.some((t) => t.id === selectedTopicId) || c.id === selectedTopicId
  );

  // Compute label for the Topic / Chapter dropdown trigger
  const getTopicDropdownLabel = () => {
    if (activeTopic) {
      const parentChap = courseChapters.find((c) => c.id === activeTopic.chapterId);
      return `${parentChap ? `${parentChap.code}: ` : ''}${activeTopic.code} ${activeTopic.name}`;
    }
    if (activeChapter) {
      return `${activeChapter.code}: ${activeChapter.name}`;
    }
    return 'Chọn chương / chủ đề kiến thức';
  };

  // Calculate next chapter number suggestion
  const getNextChapterOrder = () => {
    const existing = chapters.filter((c) => c.courseId === selectedCourseId);
    if (existing.length === 0) return 1;
    return Math.max(...existing.map((c) => c.order || 0)) + 1;
  };

  // Calculate next topic code suggestion for target chapter
  const getNextTopicCode = (chapId: string) => {
    const targetChap = chapters.find((c) => c.id === chapId);
    if (!targetChap) return '1.1';
    const chapNum = targetChap.order || 1;
    const nextIndex = targetChap.topics.length + 1;
    return `${chapNum}.${nextIndex}`;
  };

  // -------------------------------------------------------------
  // ACTION 1: SAVE NEW COURSE
  // -------------------------------------------------------------
  const handleSaveAddCourse = () => {
    const trimmedCode = newCourseCode.trim().toUpperCase();
    const trimmedName = newCourseName.trim();

    if (!trimmedCode || !trimmedName) {
      onShowToast?.('Vui lòng nhập đầy đủ Mã học phần và Tên học phần');
      return;
    }

    const newId = `course_${Date.now()}`;
    const newCourse: Course = {
      id: newId,
      code: trimmedCode,
      name: trimmedName,
      credits: 3,
      department: 'Khoa Công nghệ Thông tin',
      chaptersCount: 1,
      cloCount: 1,
      questionCount: 0,
      status: 'active',
      updatedAt: 'Vừa xong',
    };

    // Auto-create initial Chapter and Topic so the dropdown is immediately populated
    const newChapId = `chap_${Date.now()}`;
    const newTopId = `top_${Date.now()}`;
    const initialChapter: CourseChapter = {
      id: newChapId,
      courseId: newId,
      order: 1,
      code: 'Chương 1',
      name: 'Tổng quan & Cơ sở lý thuyết',
      topics: [
        {
          id: newTopId,
          chapterId: newChapId,
          code: '1.1',
          name: 'Kiến thức nền tảng & Khái niệm',
          questionCount: 0,
        },
      ],
    };

    // Update parent states
    if (onUpdateCourses) {
      onUpdateCourses([...courses, newCourse]);
    }
    if (onUpdateChapters) {
      onUpdateChapters([...chapters, initialChapter]);
    }

    // Auto-select the newly created course & its initial topic
    setSelectedCourseId(newId);
    setSelectedTopicId(newTopId);

    // Reset & close modal
    setNewCourseCode('');
    setNewCourseName('');
    setIsAddCourseModalOpen(false);

    onShowToast?.(`Đã thêm và tự động chọn học phần: ${newCourse.code} — ${newCourse.name}`);
  };

  // -------------------------------------------------------------
  // ACTION 2: SAVE NEW CHAPTER
  // -------------------------------------------------------------
  const handleSaveAddChapter = () => {
    const trimmed = newChapterName.trim();
    if (!trimmed) {
      onShowToast?.('Vui lòng nhập tên chương');
      return;
    }

    const nextOrder = getNextChapterOrder();
    // Clean code and name: check if input already includes "Chương X: " or similar
    const match = trimmed.match(/^Chương\s+(\d+)[:\s-]*(.*)$/i);
    const code = match ? `Chương ${match[1]}` : `Chương ${nextOrder}`;
    const name = match && match[2].trim() ? match[2].trim() : trimmed;

    const newChapId = `chap_${Date.now()}`;
    const newChapter: CourseChapter = {
      id: newChapId,
      courseId: selectedCourseId,
      order: nextOrder,
      code,
      name,
      topics: [],
    };

    if (onUpdateChapters) {
      onUpdateChapters([...chapters, newChapter]);
    }

    // Automatically select the newly created chapter
    setSelectedTopicId(newChapId);

    setNewChapterName('');
    setIsAddChapterOrTopicModalOpen(false);
    setAddTypeSelection('choose');

    onShowToast?.(`Đã thêm ${code}: ${name} vào học phần`);
  };

  // -------------------------------------------------------------
  // ACTION 3: SAVE NEW TOPIC
  // -------------------------------------------------------------
  const handleSaveAddTopic = () => {
    const trimmed = newTopicName.trim();
    if (!trimmed) {
      onShowToast?.('Vui lòng nhập tên chủ đề');
      return;
    }

    if (!targetChapterIdForTopic) {
      onShowToast?.('Vui lòng chọn chương trực thuộc');
      return;
    }

    const targetChap = chapters.find((c) => c.id === targetChapterIdForTopic);
    const code = getNextTopicCode(targetChapterIdForTopic);
    const newTopId = `top_${Date.now()}`;

    const newTopic: CourseTopic = {
      id: newTopId,
      chapterId: targetChapterIdForTopic,
      code,
      name: trimmed,
      questionCount: 0,
    };

    if (onUpdateChapters) {
      const updated = chapters.map((c) =>
        c.id === targetChapterIdForTopic
          ? { ...c, topics: [...c.topics, newTopic] }
          : c
      );
      onUpdateChapters(updated);
    }

    // Automatically select the newly created topic
    setSelectedTopicId(newTopId);

    setNewTopicName('');
    setIsAddChapterOrTopicModalOpen(false);
    setAddTypeSelection('choose');

    onShowToast?.(
      `Đã thêm chủ đề ${code} ${trimmed} vào ${targetChap?.code || 'chương'}`
    );
  };

  // Open "Chương mới" form with suggested numbering
  const handleOpenAddChapterForm = () => {
    const nextOrder = getNextChapterOrder();
    setNewChapterName(`Chương ${nextOrder}: `);
    setAddTypeSelection('chapter');
  };

  // Open "Chủ đề mới" form
  const handleOpenAddTopicForm = () => {
    if (courseChapters.length === 0) {
      onShowToast?.('Học phần chưa có chương nào. Vui lòng thêm chương trước.');
      return;
    }
    setNewTopicName('');
    setAddTypeSelection('topic');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const config: AIGeneratorConfig = {
      courseId: selectedCourseId,
      chapterId: activeChapter?.id,
      topicId: selectedTopicId,
      cloId: selectedCLOId,
      bloom: selectedBloom,
      questionCount,
      generationMode: 'single',
      promptNotes,
      sourceDocIds: documents.map((d) => d.id),
    };
    onSubmitSetup(config);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4">
      {/* Step Header */}
      <div className="border-b border-slate-100 pb-3">
        <h2 className="text-base font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif] flex items-center gap-2">
          <span>Thiết lập phạm vi / Ma trận CLO-Bloom</span>
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
            Bước 2 / 4
          </span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Cấu hình học phần đích, chủ đề kiến thức trọng tâm, chuẩn đầu ra (CLO) và mức nhận thức Bloom kết hợp tài liệu nguồn.
        </p>
      </div>

      {/* Extracted Documents Source Banner */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: 'var(--primary)' }}
            ></span>
            <span className="text-xs font-bold text-slate-800">
              Nguồn tài liệu: {documents.length} file đã trích xuất
            </span>
            {extractionSummary?.totalWords ? (
              <span className="text-[11px] text-slate-500">
                (~{extractionSummary.totalWords.toLocaleString()} từ ngữ liệu)
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onBack}
            className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 underline cursor-pointer"
          >
            Quản lý tài liệu nguồn
          </button>
        </div>

        {/* Document Tags */}
        <div className="flex items-center gap-2 flex-wrap">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 text-[11px] shadow-2xs"
            >
              <FileText className="w-3 h-3 text-slate-500" />
              <span className="font-semibold max-w-[200px] truncate">{doc.name}</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase">
                {doc.extension}
              </span>
            </div>
          ))}
        </div>

        {/* Extracted Key Concepts */}
        {extractionSummary?.keyConcepts && extractionSummary.keyConcepts.length > 0 && (
          <div className="pt-1 border-t border-slate-200/60">
            <div className="text-[11px] text-slate-600 font-medium mb-1.5 flex items-center gap-1">
              <Tag className="w-3 h-3 text-slate-400" />
              <span>Chủ đề phát hiện từ tài liệu:</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {extractionSummary.keyConcepts.map((concept, idx) => (
                <span
                  key={idx}
                  className="text-[10px] font-medium bg-indigo-50/70 text-indigo-900 border border-indigo-200/70 px-2 py-0.5 rounded-full"
                >
                  {concept}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Configuration Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Course & Topic Selection Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* ============================================================== */}
          {/* DROPDOWN 1: HỌC PHẦN MỤC TIÊU                                  */}
          {/* ============================================================== */}
          <div className="relative" ref={courseDropdownRef}>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Học phần mục tiêu
            </label>

            {/* Dropdown Trigger */}
            <button
              type="button"
              onClick={() => {
                setIsCourseDropdownOpen((prev) => !prev);
                setIsTopicDropdownOpen(false);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-left flex items-center justify-between hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-offset-0 transition-colors cursor-pointer"
              style={{
                borderColor: isCourseDropdownOpen ? 'var(--primary)' : undefined,
              }}
            >
              <div className="flex items-center gap-2 truncate pr-2">
                <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate text-slate-900">
                  {selectedCourse
                    ? `${selectedCourse.code} — ${selectedCourse.name}`
                    : 'Chọn học phần mục tiêu'}
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                  isCourseDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Dropdown Panel */}
            {isCourseDropdownOpen && (
              <div className="absolute z-30 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg p-1 max-h-64 overflow-y-auto custom-scrollbar">
                {/* Courses List */}
                <div className="space-y-0.5">
                  {courses.map((c) => {
                    const isSelected = c.id === selectedCourseId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCourse(c.id)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected ? 'font-semibold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                        style={
                          isSelected
                            ? {
                                backgroundColor: 'var(--primary-soft)',
                                color: 'var(--primary)',
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-center gap-2 truncate pr-2">
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                            style={{
                              borderColor: isSelected
                                ? 'var(--primary)'
                                : 'rgb(226, 232, 240)',
                              backgroundColor: isSelected
                                ? 'white'
                                : 'rgb(248, 250, 252)',
                              color: isSelected ? 'var(--primary)' : 'rgb(51, 65, 85)',
                            }}
                          >
                            {c.code}
                          </span>
                          <span className="truncate">{c.name}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* Thin divider */}
                <div className="border-t border-slate-100 my-1" />

                {/* Bottom Action: + Thêm học phần mới */}
                <button
                  type="button"
                  onClick={() => {
                    setIsCourseDropdownOpen(false);
                    setNewCourseCode('');
                    setNewCourseName('');
                    setIsAddCourseModalOpen(true);
                  }}
                  className="w-full text-left px-2.5 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-colors cursor-pointer"
                  style={{ color: 'var(--primary)' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Thêm học phần mới</span>
                </button>
              </div>
            )}
          </div>

          {/* ============================================================== */}
          {/* DROPDOWN 2: CHƯƠNG / CHỦ ĐỀ KIẾN THỨC (PHÂN CẤP HIERARCHY)     */}
          {/* ============================================================== */}
          <div className="relative" ref={topicDropdownRef}>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Chương / Chủ đề kiến thức
            </label>

            {/* Dropdown Trigger */}
            <button
              type="button"
              onClick={() => {
                setIsTopicDropdownOpen((prev) => !prev);
                setIsCourseDropdownOpen(false);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-left flex items-center justify-between hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-offset-0 transition-colors cursor-pointer"
              style={{
                borderColor: isTopicDropdownOpen ? 'var(--primary)' : undefined,
              }}
            >
              <div className="flex items-center gap-2 truncate pr-2">
                <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate text-slate-900">{getTopicDropdownLabel()}</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                  isTopicDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Dropdown Hierarchy Panel */}
            {isTopicDropdownOpen && (
              <div className="absolute z-30 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg p-1.5 max-h-72 overflow-y-auto custom-scrollbar">
                {courseChapters.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500">
                    Chưa có chương nào trong học phần này.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {courseChapters.map((chap) => {
                      const isChapSelected = selectedTopicId === chap.id;
                      return (
                        <div key={chap.id} className="space-y-0.5">
                          {/* Chapter Header (Parent / Group) */}
                          <div className="bg-slate-50/80 px-2.5 py-1.5 rounded-lg border border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                              <FolderTree className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span>
                                {chap.code}: {chap.name}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {chap.topics.length} chủ đề
                            </span>
                          </div>

                          {/* Topics List (Children - Indented 20px) */}
                          {chap.topics.length > 0 ? (
                            <div className="space-y-0.5">
                              {chap.topics.map((top) => {
                                const isSelected = selectedTopicId === top.id;
                                return (
                                  <button
                                    key={top.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedTopicId(top.id);
                                      setIsTopicDropdownOpen(false);
                                    }}
                                    className={`w-full text-left pl-6 pr-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                      isSelected
                                        ? 'font-semibold'
                                        : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                    style={
                                      isSelected
                                        ? {
                                            backgroundColor: 'var(--primary-soft)',
                                            color: 'var(--primary)',
                                          }
                                        : undefined
                                    }
                                  >
                                    <div className="flex items-center gap-1.5 truncate pr-2">
                                      <span className="text-slate-400">•</span>
                                      <span className="font-semibold text-slate-500 shrink-0">
                                        {top.code}
                                      </span>
                                      <span className="truncate">{top.name}</span>
                                    </div>
                                    {isSelected && (
                                      <Check className="w-3.5 h-3.5 shrink-0" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            /* If chapter has no topics, allow selecting the chapter itself */
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTopicId(chap.id);
                                setIsTopicDropdownOpen(false);
                              }}
                              className={`w-full text-left pl-6 pr-2.5 py-1.5 rounded-lg text-xs italic transition-colors cursor-pointer ${
                                isChapSelected
                                  ? 'font-semibold'
                                  : 'text-slate-500 hover:bg-slate-50'
                              }`}
                              style={
                                isChapSelected
                                  ? {
                                      backgroundColor: 'var(--primary-soft)',
                                      color: 'var(--primary)',
                                    }
                                  : undefined
                              }
                            >
                              <span>(Toàn bộ chương - chưa phân chủ đề con)</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Thin Divider */}
                <div className="border-t border-slate-100 my-1" />

                {/* Bottom Action: + Thêm chương / chủ đề mới */}
                <button
                  type="button"
                  onClick={() => {
                    setIsTopicDropdownOpen(false);
                    setAddTypeSelection('choose');
                    setIsAddChapterOrTopicModalOpen(true);
                  }}
                  className="w-full text-left px-2.5 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-colors cursor-pointer"
                  style={{ color: 'var(--primary)' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Thêm chương / chủ đề mới</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* CLO & Bloom Level */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Chuẩn đầu ra (CLO) gắn với câu hỏi
            </label>
            <select
              value={selectedCLOId}
              onChange={(e) => setSelectedCLOId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:border-indigo-500"
            >
              {courseCLOs.map((clo) => (
                <option key={clo.id} value={clo.id}>
                  {clo.code} — {clo.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Mức độ nhận thức Bloom
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['remember', 'understand', 'apply'] as Bloom3Level[]).map((lvl) => {
                const cfg = BLOOM_3_CONFIG[lvl];
                const isSelected = selectedBloom === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSelectedBloom(lvl)}
                    className={`py-2 text-center rounded-xl border font-bold text-xs transition-all cursor-pointer ${
                      isSelected
                        ? `${cfg.bgClass} ${cfg.textClass} ${cfg.borderClass} ring-1 ring-offset-0 shadow-2xs`
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Question Count Selection */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Số lượng câu hỏi AI cần sinh
          </label>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 5, 10].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setQuestionCount(num)}
                className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  questionCount === num
                    ? 'border-[var(--primary)] text-white shadow-2xs'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                style={
                  questionCount === num ? { backgroundColor: 'var(--primary)' } : undefined
                }
              >
                {num} câu
              </button>
            ))}
          </div>
        </div>

        {/* Specific focus prompt notes */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Yêu cầu trọng tâm bổ sung cho AI (tùy chọn)
          </label>
          <textarea
            rows={2}
            value={promptNotes}
            onChange={(e) => setPromptNotes(e.target.value)}
            placeholder="Ví dụ: Tăng cường câu hỏi tình huống thực tế, kèm phân tích phương án nhiễu..."
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Buttons */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại tài liệu</span>
          </button>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl text-white font-bold text-xs shadow-xs hover:opacity-95 active:scale-[0.98] flex items-center gap-2 cursor-pointer transition-all"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <Sparkles className="w-4 h-4" />
            <span>Tiến hành sinh {questionCount} câu hỏi</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* ============================================================== */}
      {/* MODAL 1: THÊM HỌC PHẦN MỚI (COMPACT DRAWER/MODAL)               */}
      {/* ============================================================== */}
      {isAddCourseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'var(--primary-soft)' }}
                >
                  <BookOpen className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif]">
                    Thêm học phần mới
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Bổ sung học phần mục tiêu vào danh mục hệ thống
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCourseModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body */}
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mã học phần <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value.toUpperCase())}
                  placeholder="Ví dụ: CS202, IT305..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 uppercase font-semibold"
                  style={{ borderColor: 'var(--primary)' }}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên học phần <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  placeholder="Ví dụ: Lập trình mạng nâng cao..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1"
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddCourseModalOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveAddCourse}
                className="px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs hover:opacity-95 transition-all cursor-pointer"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                Lưu học phần
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: THÊM CHƯƠNG / CHỦ ĐỀ MỚI (CHOOSE / CHAPTER / TOPIC)   */}
      {/* ============================================================== */}
      {isAddChapterOrTopicModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* VIEW A: CHỌN LOẠI CẦN THÊM (BẠN MUỐN THÊM GÌ?) */}
            {addTypeSelection === 'choose' && (
              <div>
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif]">
                      Bạn muốn thêm gì?
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Chọn cấp độ phân tầng kiến thức cần bổ sung vào học phần:
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddChapterOrTopicModalOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 grid grid-cols-2 gap-3">
                  {/* Option 1: Chương mới */}
                  <button
                    type="button"
                    onClick={handleOpenAddChapterForm}
                    className="p-4 rounded-xl border border-slate-200 text-left hover:border-indigo-400 hover:bg-slate-50/80 transition-all cursor-pointer group flex flex-col items-start gap-2"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
                      style={{ backgroundColor: 'var(--primary-soft)' }}
                    >
                      <FolderTree
                        className="w-5 h-5"
                        style={{ color: 'var(--primary)' }}
                      />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block group-hover:text-indigo-950">
                        Chương mới
                      </span>
                      <span className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                        Tạo chương nội dung lớn (Chương 1, 2...)
                      </span>
                    </div>
                  </button>

                  {/* Option 2: Chủ đề mới */}
                  <button
                    type="button"
                    onClick={handleOpenAddTopicForm}
                    className="p-4 rounded-xl border border-slate-200 text-left hover:border-indigo-400 hover:bg-slate-50/80 transition-all cursor-pointer group flex flex-col items-start gap-2"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
                      style={{ backgroundColor: 'var(--primary-soft)' }}
                    >
                      <Tag className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block group-hover:text-indigo-950">
                        Chủ đề mới
                      </span>
                      <span className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                        Thêm mục kiến thức chi tiết (1.1, 1.2...)
                      </span>
                    </div>
                  </button>
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsAddChapterOrTopicModalOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            )}

            {/* VIEW B: FORM THÊM CHƯƠNG MỚI */}
            {addTypeSelection === 'chapter' && (
              <div>
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAddTypeSelection('choose')}
                      className="p-1 -ml-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                      title="Quay lại lựa chọn"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif]">
                        Thêm chương mới
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Học phần: {selectedCourse?.code} — {selectedCourse?.name}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddChapterOrTopicModalOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tên chương <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newChapterName}
                      onChange={(e) => setNewChapterName(e.target.value)}
                      placeholder={`Ví dụ: Chương ${getNextChapterOrder()}: Bảo mật mạng`}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1"
                      autoFocus
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Gợi ý: Hệ thống sẽ tự động gán thứ tự{' '}
                      <strong>Chương {getNextChapterOrder()}</strong> nếu không chỉ định.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setAddTypeSelection('choose')}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Quay lại</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddChapterOrTopicModalOpen(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAddChapter}
                      className="px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs hover:opacity-95 transition-all cursor-pointer"
                      style={{ backgroundColor: 'var(--primary)' }}
                    >
                      Lưu chương
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW C: FORM THÊM CHỦ ĐỀ MỚI */}
            {addTypeSelection === 'topic' && (
              <div>
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAddTypeSelection('choose')}
                      className="p-1 -ml-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                      title="Quay lại lựa chọn"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif]">
                        Thêm chủ đề mới
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Học phần: {selectedCourse?.code} — {selectedCourse?.name}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddChapterOrTopicModalOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 space-y-3">
                  {/* Select target chapter */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Thuộc chương <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={targetChapterIdForTopic}
                      onChange={(e) => setTargetChapterIdForTopic(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:border-indigo-500"
                    >
                      {courseChapters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code}: {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Topic Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tên chủ đề <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newTopicName}
                      onChange={(e) => setNewTopicName(e.target.value)}
                      placeholder="Ví dụ: Thiết lập DNS nâng cao"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1"
                      autoFocus
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Mã chủ đề tự động gợi ý:{' '}
                      <strong>{getNextTopicCode(targetChapterIdForTopic)}</strong>
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setAddTypeSelection('choose')}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Quay lại</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddChapterOrTopicModalOpen(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAddTopic}
                      className="px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs hover:opacity-95 transition-all cursor-pointer"
                      style={{ backgroundColor: 'var(--primary)' }}
                    >
                      Lưu chủ đề
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
