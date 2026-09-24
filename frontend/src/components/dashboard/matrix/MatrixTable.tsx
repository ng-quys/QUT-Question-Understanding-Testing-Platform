import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Course, CourseChapter, CourseCLO } from '../../../types';
import { MatrixKnowledgeUnit, MatrixSummaryStats, RowValidation } from './types';
import { MatrixChapterGroup } from './MatrixChapterGroup';
import { MatrixSummary, MatrixSummaryBottomBar } from './MatrixSummary';
import { MatrixDeleteModal, DeleteConfirmState } from './MatrixDeleteModal';

interface MatrixTableProps {
  course: Course | undefined;
  courseChapters: CourseChapter[];
  units: MatrixKnowledgeUnit[];
  courseCLOs: CourseCLO[];
  summary: MatrixSummaryStats;
  unitValidationMap: Record<string, RowValidation>;
  bloomGuidance: {
    nb: number;
    th: number;
    vd: number;
  };
  onUpdateBloomGuidance: (newGuidance: { nb: number; th: number; vd: number }) => void;
  enableDistributionControl: boolean;
  onUpdateUnit: (id: string, updates: Partial<MatrixKnowledgeUnit>) => void;
  onDeleteUnit: (id: string) => void;
  onAddUnitToChapter: (chapterId: string, name: string) => void;
  onAddNewChapter: (name: string) => void;
  onDeleteChapter: (chapterId: string) => void;
  onChangeChapterForGroup: (oldChapterId: string, newChapterId: string) => void;
}

export const MatrixTable: React.FC<MatrixTableProps> = ({
  course,
  courseChapters,
  units,
  courseCLOs,
  summary,
  unitValidationMap,
  bloomGuidance,
  onUpdateBloomGuidance,
  enableDistributionControl,
  onUpdateUnit,
  onDeleteUnit,
  onAddUnitToChapter,
  onAddNewChapter,
  onDeleteChapter,
  onChangeChapterForGroup,
}) => {
  // Unified delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>({
    isOpen: false,
    scope: 'unit',
    targetId: '',
    targetName: '',
  });

  // Open confirmation modals with proper scope & severity
  const handleRequestDeleteChapter = (chapterId: string, chapterName: string) => {
    setDeleteConfirm({
      isOpen: true,
      scope: 'chapter',
      targetId: chapterId,
      targetName: chapterName,
    });
  };

  const handleRequestDeleteUnit = (unitId: string, unitName: string) => {
    setDeleteConfirm({
      isOpen: true,
      scope: 'unit',
      targetId: unitId,
      targetName: unitName,
    });
  };

  const handleRequestUnassignCLO = (unitId: string, unitName: string) => {
    setDeleteConfirm({
      isOpen: true,
      scope: 'clo',
      targetId: unitId,
      targetName: unitName,
    });
  };

  // Execute confirmed deletion
  const handleExecuteConfirm = () => {
    const { scope, targetId } = deleteConfirm;
    if (scope === 'chapter') {
      onDeleteChapter(targetId);
    } else if (scope === 'unit') {
      onDeleteUnit(targetId);
    } else if (scope === 'clo') {
      // Unassign CLO only: set cloId to empty string
      onUpdateUnit(targetId, { cloId: '' });
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
      {/* Table Section Heading & Subtitle */}
      <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/40">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
            Ma trận câu hỏi học phần
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Định hình số lượng và phân bổ câu hỏi theo chuẩn kiến thức và chuẩn đầu ra.
          </p>
        </div>

        {course && (
          <div className="flex items-center gap-2 self-start sm:self-auto text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>
              {courseChapters.length} chương • {units.length} đơn vị kiến thức
            </span>
          </div>
        )}
      </div>

      {/* Table Container with Horizontal Scroll and Sticky Header */}
      <div className="relative overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[960px] border border-slate-200">
          {/* Table Header with Primary Color matching Figma screenshot 1 */}
          <thead
            className="text-white text-xs font-bold sticky top-0 z-10 shadow-sm"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <tr>
              {/* 1. TT */}
              <th
                scope="col"
                className="w-14 px-3 py-3.5 text-center border-r border-white/20 whitespace-nowrap"
              >
                TT
              </th>

              {/* 2. CHỦ ĐỀ / CHƯƠNG */}
              <th
                scope="col"
                className="px-4 py-3.5 min-w-[230px] border-r border-white/20 whitespace-nowrap"
              >
                Chủ đề/Chương
              </th>

              {/* 3. NỘI DUNG / ĐƠN VỊ KIẾN THỨC */}
              <th
                scope="col"
                className="px-4 py-3.5 min-w-[250px] border-r border-white/20 whitespace-nowrap"
              >
                Nội dung/Đơn vị kiến thức
              </th>

              {/* 4. YÊU CẦU CẦN ĐẠT (CLO) */}
              <th
                scope="col"
                className="px-4 py-3.5 min-w-[240px] border-r border-white/20 whitespace-nowrap"
              >
                Yêu cầu cần đạt
              </th>

              {/* 5. NHẬN BIẾT (NB) */}
              <th
                scope="col"
                className="w-28 px-2 py-3.5 text-center border-r border-white/20 whitespace-nowrap"
                title="Nhận biết / Remember (Cấp độ 1)"
              >
                <div className="inline-flex items-center justify-center gap-1 group cursor-help text-white">
                  <span>Nhận biết (NB)</span>
                  <HelpCircle className="w-3 h-3 opacity-70 group-hover:opacity-100" />
                </div>
              </th>

              {/* 6. THÔNG HIỂU (TH) */}
              <th
                scope="col"
                className="w-28 px-2 py-3.5 text-center border-r border-white/20 whitespace-nowrap"
                title="Thông hiểu / Understand (Cấp độ 2)"
              >
                <div className="inline-flex items-center justify-center gap-1 group cursor-help text-white">
                  <span>Thông hiểu (TH)</span>
                  <HelpCircle className="w-3 h-3 opacity-70 group-hover:opacity-100" />
                </div>
              </th>

              {/* 7. VẬN DỤNG (VD) */}
              <th
                scope="col"
                className="w-28 px-2 py-3.5 text-center whitespace-nowrap"
                title="Vận dụng / Apply (Cấp độ 3)"
              >
                <div className="inline-flex items-center justify-center gap-1 group cursor-help text-white">
                  <span>Vận dụng (VD)</span>
                  <HelpCircle className="w-3 h-3 opacity-70 group-hover:opacity-100" />
                </div>
              </th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="text-xs bg-white">
            {courseChapters.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                  Học phần này chưa có chương nào trong ma trận.
                </td>
              </tr>
            ) : (
              courseChapters.map((chapter, chapIdx) => {
                const chapUnits = units.filter((u) => u.chapterId === chapter.id);
                return (
                  <MatrixChapterGroup
                    key={chapter.id}
                    chapterIndex={chapIdx}
                    chapter={chapter}
                    allChapters={courseChapters}
                    units={chapUnits}
                    courseCLOs={courseCLOs}
                    unitValidationMap={unitValidationMap}
                    onUpdateUnit={onUpdateUnit}
                    onAddUnitToChapter={onAddUnitToChapter}
                    onDeleteUnit={handleRequestDeleteUnit}
                    onUnassignCLO={handleRequestUnassignCLO}
                    onChangeChapterForGroup={onChangeChapterForGroup}
                    onAddNewChapter={onAddNewChapter}
                    onDeleteChapter={handleRequestDeleteChapter}
                  />
                );
              })
            )}
          </tbody>

          {/* Table Footer with Summary Stats */}
          <MatrixSummary summary={summary} />
        </table>
      </div>

      {/* Horizontal Summary Bar */}
      <MatrixSummaryBottomBar summary={summary} />

      {/* Confirmation Modal for Delete Chapter, Unit, or CLO */}
      <MatrixDeleteModal
        confirmState={deleteConfirm}
        onClose={() =>
          setDeleteConfirm((prev) => ({
            ...prev,
            isOpen: false,
          }))
        }
        onConfirm={handleExecuteConfirm}
      />
    </div>
  );
};
