import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, FileText, Award } from 'lucide-react';
import { Course, CourseChapter, CourseCLO, QuestionItem, SourceDocument } from '../../../types';
import { MatrixKnowledgeUnit, MatrixCustomConfig } from './types';
import {
  calculateMatrixSummary,
  validateMatrix,
  buildInitialMatrixForCourse,
  exportMatrixToCSV,
} from './matrixLogic';
import { MatrixToolbar } from './MatrixToolbar';
import { MatrixTable } from './MatrixTable';
import { AIInstruction } from './AIInstruction';
import { MatrixActions } from './MatrixActions';
import { AddChapterTopicModal } from './AddChapterTopicModal';
import { MatrixCustomizationModal } from './MatrixCustomizationModal';
import { MatrixPreviewModal } from './MatrixPreviewModal';

export interface MatrixPageProps {
  courses: Course[];
  chapters: CourseChapter[];
  clos: CourseCLO[];
  questions: QuestionItem[];
  onShowToast: (msg: string) => void;
  onOpenAIGenerator?: () => void;
  onUpdateCourses?: (courses: Course[]) => void;
  onUpdateChapters?: (chapters: CourseChapter[]) => void;
  onSaveGeneratedExam?: (examTitle: string, selectedQuestions: QuestionItem[]) => void;
  onStartGenerationWithMatrix?: (data: {
    courseId: string;
    totalQuestions: number;
    units: MatrixKnowledgeUnit[];
    summary: ReturnType<typeof calculateMatrixSummary>;
    aiInstruction: string;
    defaultScore: number;
  }) => void;
  onBackToUpload?: () => void;
  uploadedDocuments?: SourceDocument[];
}

export const MatrixPage: React.FC<MatrixPageProps> = ({
  courses,
  chapters,
  clos,
  questions,
  onShowToast,
  onOpenAIGenerator,
  onUpdateCourses,
  onUpdateChapters,
  onSaveGeneratedExam,
  onStartGenerationWithMatrix,
  onBackToUpload,
  uploadedDocuments,
}) => {
  // 1. Selected Course
  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => {
    const ti01 = courses.find((c) => c.code === 'TI01');
    return ti01 ? ti01.id : courses[0]?.id || '';
  });

  const selectedCourse = useMemo(() => {
    return courses.find((c) => c.id === selectedCourseId) || courses[0];
  }, [courses, selectedCourseId]);

  const courseChapters = useMemo(() => {
    return chapters
      .filter((c) => c.courseId === selectedCourseId)
      .sort((a, b) => a.order - b.order);
  }, [chapters, selectedCourseId]);

  const courseCLOs = useMemo(() => {
    return clos.filter((c) => c.courseId === selectedCourseId);
  }, [clos, selectedCourseId]);

  // 2. Matrix Units & Active Chapters State
  const [units, setUnits] = useState<MatrixKnowledgeUnit[]>(() => {
    return buildInitialMatrixForCourse(selectedCourseId, chapters, clos);
  });

  const [activeChapterIds, setActiveChapterIds] = useState<string[]>(() => {
    return chapters.filter((c) => c.courseId === selectedCourseId).map((c) => c.id);
  });

  // Active chapters currently included in this matrix
  const matrixChapters = useMemo(() => {
    const list = courseChapters.filter((c) => activeChapterIds.includes(c.id));
    // If active list is empty but chapters exist, default to all course chapters
    return list.length > 0 ? list : courseChapters;
  }, [courseChapters, activeChapterIds]);

  // When course changes, initialize matrix for new course
  const handleSelectCourse = (newCourseId: string) => {
    setSelectedCourseId(newCourseId);
    const newUnits = buildInitialMatrixForCourse(newCourseId, chapters, clos);
    setUnits(newUnits);
    setActiveChapterIds(chapters.filter((c) => c.courseId === newCourseId).map((c) => c.id));
    const cObj = courses.find((c) => c.id === newCourseId);
    onShowToast(`Đã chuyển ma trận sang học phần: ${cObj?.code || ''} — ${cObj?.name || ''}`);
  };

  // 3. AI Instruction & Custom Config
  const [aiInstruction, setAiInstruction] = useState<string>('');
  const [defaultScore, setDefaultScore] = useState<number>(0.5);
  const [customConfig, setCustomConfig] = useState<MatrixCustomConfig>({
    targetTotal: 50,
    showAvailability: true,
    pointsPerQuestion: 0.2,
    enableDistributionControl: true,
    bloomGuidance: {
      nb: 40,
      th: 30,
      vd: 30,
    },
  });

  const handleUpdateBloomGuidance = (newGuidance: { nb: number; th: number; vd: number }) => {
    setCustomConfig((prev) => ({
      ...prev,
      bloomGuidance: newGuidance,
    }));
  };

  const totalBloomPct =
    customConfig.bloomGuidance.nb +
    customConfig.bloomGuidance.th +
    customConfig.bloomGuidance.vd;
  const isDistributionValid =
    !customConfig.enableDistributionControl || totalBloomPct === 100;

  // 4. Modals State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // 5. Calculations & Real-time Validation
  const summary = useMemo(() => {
    return calculateMatrixSummary(units);
  }, [units]);

  const validation = useMemo(() => {
    return validateMatrix(units, questions, selectedCourseId);
  }, [units, questions, selectedCourseId]);

  // Unit Update Handlers
  const handleUpdateUnit = (id: string, updates: Partial<MatrixKnowledgeUnit>) => {
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...updates } : u)));
  };

  const handleDeleteUnit = (id: string) => {
    if (units.length <= 1) {
      onShowToast('Ma trận phải có ít nhất 1 đơn vị kiến thức.');
      return;
    }
    const unitToDelete = units.find((u) => u.id === id);
    setUnits((prev) => prev.filter((u) => u.id !== id));
    onShowToast(`Đã xóa đơn vị kiến thức: ${unitToDelete?.name || ''}`);
  };

  const handleAddUnitToChapter = (chapterId: string, name: string) => {
    const chap = courseChapters.find((c) => c.id === chapterId);
    const newUnit: MatrixKnowledgeUnit = {
      id: `unit_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      chapterId,
      name,
      cloId: '', // Default unassigned as per spec item 4
      nb: 0, // Default 0 as per spec item 4
      th: 0,
      vd: 0,
      order: units.filter((u) => u.chapterId === chapterId).length + 1,
    };

    setUnits((prev) => [...prev, newUnit]);

    // Also update chapter topics in parent state if onUpdateChapters provided
    if (onUpdateChapters) {
      const updatedChapters = chapters.map((c) => {
        if (c.id === chapterId) {
          const newTopic = {
            id: newUnit.id,
            chapterId: c.id,
            code: `${c.topics.length + 1}`,
            name,
            questionCount: 0,
          };
          return {
            ...c,
            topics: [...c.topics, newTopic],
          };
        }
        return c;
      });
      onUpdateChapters(updatedChapters);
    }

    onShowToast(`Đã thêm "${name}" vào ${chap?.code || 'chương'}`);
  };

  // Add Chapter from Dropdown or Modal
  const handleAddNewChapter = (name: string, order?: number) => {
    const newChapId = `chap_${Date.now()}`;
    const newChapter: CourseChapter = {
      id: newChapId,
      courseId: selectedCourseId,
      order: order !== undefined ? order : courseChapters.length + 1,
      code: `Chương ${courseChapters.length + 1}`,
      name,
      topics: [],
    };

    if (onUpdateChapters) {
      onUpdateChapters([...chapters, newChapter]);
    }
    setActiveChapterIds((prev) => [...prev, newChapId]);

    // Automatically add an initial unit to this new chapter
    const initialUnit: MatrixKnowledgeUnit = {
      id: `unit_${Date.now()}`,
      chapterId: newChapId,
      name: `${name} (Đơn vị 1)`,
      cloId: '',
      nb: 0,
      th: 0,
      vd: 0,
      order: 1,
    };
    setUnits((prev) => [...prev, initialUnit]);
    onShowToast(`Đã thêm ${newChapter.code}: ${name}`);
  };

  // Delete Chapter from Matrix (Cascade Delete: Chapter + Units + CLO assignments + Bloom counts)
  const handleDeleteChapter = (chapterId: string) => {
    const chapToDelete = courseChapters.find((c) => c.id === chapterId);
    setActiveChapterIds((prev) => prev.filter((id) => id !== chapterId));
    setUnits((prev) => prev.filter((u) => u.chapterId !== chapterId));
    onShowToast(`Đã xóa toàn bộ "${chapToDelete?.name || 'chương'}" khỏi ma trận.`);
  };

  // Change chapter for an entire group
  const handleChangeChapterForGroup = (oldChapterId: string, newChapterId: string) => {
    setUnits((prev) =>
      prev.map((u) => (u.chapterId === oldChapterId ? { ...u, chapterId: newChapterId } : u))
    );
    setActiveChapterIds((prev) => {
      const next = prev.filter((id) => id !== oldChapterId);
      if (!next.includes(newChapterId)) {
        next.push(newChapterId);
      }
      return next;
    });
    const targetChap = courseChapters.find((c) => c.id === newChapterId);
    onShowToast(`Đã chuyển nhóm sang: ${targetChap?.name || ''}`);
  };

  // Add Chapter from Modal
  const handleAddChapter = (name: string, order: number) => {
    handleAddNewChapter(name, order);
  };

  // Add Topic from Modal
  const handleAddTopic = (chapterId: string, name: string) => {
    handleAddUnitToChapter(chapterId, name);
  };

  // Save Matrix Framework
  const handleSaveMatrix = () => {
    try {
      localStorage.setItem(
        `matrix_${selectedCourseId}`,
        JSON.stringify({
          units,
          customConfig,
          aiInstruction,
          updatedAt: new Date().toISOString(),
        })
      );
      onShowToast(`Đã lưu khung ma trận học phần ${selectedCourse?.name || ''} thành công!`);
    } catch {
      onShowToast('Đã lưu cấu hình ma trận vào phiên làm việc.');
    }
  };

  // Export to CSV for Excel
  const handleExportExcel = () => {
    exportMatrixToCSV(selectedCourse, courseChapters, units, courseCLOs, summary);
    onShowToast('Đang tải file Excel (CSV UTF-8) ma trận câu hỏi...');
  };

  // Trigger AI Question Generation
  const handleGenerateWithAI = () => {
    if (!validation.isValid || summary.matrixTotal <= 0) {
      onShowToast('Vui lòng hoàn thiện cấu hình ma trận trước khi sinh câu hỏi.');
      return;
    }

    try {
      sessionStorage.setItem(
        'pending_exam_matrix',
        JSON.stringify({
          courseId: selectedCourseId,
          totalQuestions: summary.matrixTotal,
          units,
          summary,
          aiInstruction,
          defaultScore,
          bloomGuidance: customConfig.bloomGuidance,
        })
      );
    } catch {
      // ignore
    }

    if (onStartGenerationWithMatrix) {
      onStartGenerationWithMatrix({
        courseId: selectedCourseId,
        totalQuestions: summary.matrixTotal,
        units,
        summary,
        aiInstruction,
        defaultScore,
      });
      return;
    }

    onShowToast(`Đang chuẩn bị sinh ${summary.matrixTotal} câu hỏi bằng AI...`);
    onOpenAIGenerator();
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12 animate-in fade-in duration-150">
      {/* Context banner if coming from Step 1 (Upload) */}
      {onBackToUpload && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 p-3.5 bg-indigo-50/80 border border-indigo-200/90 rounded-xl text-xs">
          <div className="flex items-center gap-2.5 text-indigo-950 font-medium">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-indigo-900">
                Bước 2: Cấu hình ma trận câu hỏi học phần
              </div>
              <div className="text-[11px] text-indigo-700">
                {uploadedDocuments && uploadedDocuments.length > 0 ? (
                  <>
                    Đã nạp <strong className="font-bold">{uploadedDocuments.length} tài liệu nguồn</strong> ({uploadedDocuments.map((d) => d.name).join(', ')}) làm cơ sở tri thức cho AI sinh câu hỏi.
                  </>
                ) : (
                  <>Đang áp dụng chuẩn đầu ra (CLO) và chương mục học phần làm cơ sở tri thức.</>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onBackToUpload}
            className="text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-white border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Đổi tài liệu nguồn (Bước 1)</span>
          </button>
        </div>
      )}

      {/* 1. Header Toolbar */}
      <MatrixToolbar
        courses={courses}
        selectedCourseId={selectedCourseId}
        onSelectCourse={handleSelectCourse}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenCustomModal={() => setIsCustomModalOpen(true)}
      />

      {/* 2. Main Matrix Table */}
      <MatrixTable
        course={selectedCourse}
        courseChapters={matrixChapters}
        units={units}
        courseCLOs={courseCLOs}
        summary={summary}
        unitValidationMap={validation.unitValidationMap}
        bloomGuidance={customConfig.bloomGuidance}
        onUpdateBloomGuidance={handleUpdateBloomGuidance}
        enableDistributionControl={customConfig.enableDistributionControl}
        onUpdateUnit={handleUpdateUnit}
        onDeleteUnit={handleDeleteUnit}
        onAddUnitToChapter={handleAddUnitToChapter}
        onAddNewChapter={handleAddNewChapter}
        onDeleteChapter={handleDeleteChapter}
        onChangeChapterForGroup={handleChangeChapterForGroup}
      />

      {/* Thiết lập điểm số mặc định cho mỗi câu hỏi sinh ra */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
            <Award className="w-4 h-4" />
          </div>
          <div>
            <label
              htmlFor="matrix-default-score-input"
              className="text-xs font-bold text-slate-900 block cursor-pointer"
            >
              Điểm mặc định cho mỗi câu hỏi sinh ra:
            </label>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Áp dụng giá trị này làm điểm số mặc định cho toàn bộ câu hỏi được sinh ra từ ma trận này.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <div className="relative flex items-center">
            <input
              id="matrix-default-score-input"
              type="number"
              min={0}
              max={10}
              step={0.25}
              value={defaultScore}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setDefaultScore(isNaN(val) ? 0.5 : Math.max(0, Math.min(10, val)));
              }}
              className="w-24 px-3 py-1.5 text-center font-bold text-xs text-slate-900 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-300 focus:border-indigo-600 rounded-lg outline-none transition-all shadow-2xs"
            />
          </div>
          <span className="text-xs font-semibold text-slate-600">điểm / câu</span>
        </div>
      </div>

      {/* 3. AI Extra Instruction Box */}
      <AIInstruction value={aiInstruction} onChange={setAiInstruction} />

      {/* 4. Fixed Bottom Action Bar */}
      <MatrixActions
        matrixTotal={summary.matrixTotal}
        isValid={validation.isValid}
        onSave={handleSaveMatrix}
        onPreview={() => setIsPreviewModalOpen(true)}
        onExportExcel={handleExportExcel}
        onGenerateWithAI={handleGenerateWithAI}
        onBack={onBackToUpload}
      />

      {/* 5. Modals */}
      <AddChapterTopicModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        courseChapters={courseChapters}
        onAddChapter={handleAddChapter}
        onAddTopic={handleAddTopic}
      />

      <MatrixCustomizationModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        config={customConfig}
        onSaveConfig={setCustomConfig}
      />

      <MatrixPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        course={selectedCourse}
        chapters={chapters}
        units={units}
        clos={courseCLOs}
        summary={summary}
        aiInstruction={aiInstruction}
        onExportExcel={handleExportExcel}
      />
    </div>
  );
};
