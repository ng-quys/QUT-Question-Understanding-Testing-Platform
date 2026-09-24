import React, { useState } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { CourseCLO, CourseChapter } from '../../../types';
import { MatrixKnowledgeUnit, RowValidation } from './types';
import { MatrixKnowledgeRow } from './MatrixKnowledgeRow';
import { ChapterSelector } from './ChapterSelector';

interface MatrixChapterGroupProps {
  chapterIndex: number;
  chapter: CourseChapter;
  allChapters: CourseChapter[];
  units: MatrixKnowledgeUnit[];
  courseCLOs: CourseCLO[];
  unitValidationMap: Record<string, RowValidation>;
  onUpdateUnit: (id: string, updates: Partial<MatrixKnowledgeUnit>) => void;
  onAddUnitToChapter: (chapterId: string, name: string) => void;
  onDeleteUnit: (id: string, name: string) => void;
  onUnassignCLO: (id: string, name: string) => void;
  onChangeChapterForGroup: (oldChapterId: string, newChapterId: string) => void;
  onAddNewChapter: (chapterName: string) => void;
  onDeleteChapter: (chapterId: string, chapterName: string) => void;
}

export const MatrixChapterGroup: React.FC<MatrixChapterGroupProps> = ({
  chapterIndex,
  chapter,
  allChapters,
  units,
  courseCLOs,
  unitValidationMap,
  onUpdateUnit,
  onAddUnitToChapter,
  onDeleteUnit,
  onUnassignCLO,
  onChangeChapterForGroup,
  onAddNewChapter,
  onDeleteChapter,
}) => {
  const [isAddingInline, setIsAddingInline] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');

  const handleSaveInline = () => {
    const trimmed = newUnitName.trim();
    if (!trimmed) return;
    onAddUnitToChapter(chapter.id, trimmed);
    setNewUnitName('');
    setIsAddingInline(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveInline();
    } else if (e.key === 'Escape') {
      setIsAddingInline(false);
      setNewUnitName('');
    }
  };

  // rowSpan is units.length + 1 (the unit rows + the "+ Thêm đơn vị" row)
  // If units.length === 0, rowSpan is 1
  const rowSpan = units.length > 0 ? units.length + 1 : 1;

  return (
    <>
      {units.length === 0 ? (
        // Case with 0 units in this chapter
        <tr className="border-b-2 border-slate-300 hover:bg-slate-50/50">
          {/* 1. TT */}
          <td className="px-3 py-3 text-center text-xs font-bold text-slate-700 align-middle border-r border-slate-200 w-14">
            {chapterIndex + 1}
          </td>

          {/* 2. CHƯƠNG / CHỦ ĐỀ */}
          <td className="px-3 py-3 align-middle border-r border-slate-200 min-w-[230px]">
            <ChapterSelector
              currentChapter={chapter}
              allChapters={allChapters}
              onSelectChapter={(newId) => onChangeChapterForGroup(chapter.id, newId)}
              onAddNewChapter={onAddNewChapter}
              onDeleteChapter={() => onDeleteChapter(chapter.id, chapter.name)}
            />
          </td>

          {/* 3. ĐƠN VỊ KIẾN THỨC / YÊU CẦU: Quick add button */}
          <td className="px-3 py-3 align-middle border-r border-slate-200">
            {isAddingInline ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  autoFocus
                  placeholder="Nhập tên yêu cầu cần đạt / đơn vị kiến thức..."
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:border-[var(--primary)] focus:outline-none w-full bg-white shadow-2xs font-medium"
                />
                <button
                  type="button"
                  onClick={handleSaveInline}
                  className="p-1.5 rounded-lg text-white font-bold cursor-pointer shrink-0"
                  style={{ backgroundColor: 'var(--primary)' }}
                  title="Lưu"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingInline(false);
                    setNewUnitName('');
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer shrink-0"
                  title="Hủy"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingInline(true)}
                className="w-full py-2 px-3 border border-dashed rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer hover:bg-slate-50"
                style={{
                  borderColor: 'var(--primary)',
                  color: 'var(--primary)',
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Thêm yêu cầu</span>
              </button>
            )}
          </td>

          {/* 4. CLO: Empty cell */}
          <td className="px-3 py-3 align-middle border-r border-slate-200"></td>

          {/* 5, 6, 7. BLOOM: Empty cells */}
          <td className="px-2 py-3 border-r border-slate-200"></td>
          <td className="px-2 py-3 border-r border-slate-200"></td>
          <td className="px-2 py-3"></td>
        </tr>
      ) : (
        // Case with 1 or more units
        <>
          {units.map((unit, uIdx) => {
            const isFirst = uIdx === 0;
            return (
              <tr
                key={unit.id}
                className="hover:bg-slate-50/70 transition-colors border-b border-slate-200"
              >
                {/* 1. TT (rowSpan) */}
                {isFirst && (
                  <td
                    rowSpan={rowSpan}
                    className="px-3 py-3 text-center text-xs font-bold text-slate-700 align-top bg-white border-r border-slate-200 w-14"
                  >
                    <span className="sticky top-20 block pt-1">{chapterIndex + 1}</span>
                  </td>
                )}

                {/* 2. CHƯƠNG / CHỦ ĐỀ (rowSpan) */}
                {isFirst && (
                  <td
                    rowSpan={rowSpan}
                    className="px-3 py-3 align-top bg-white border-r border-slate-200 min-w-[230px]"
                  >
                    <div className="sticky top-20 pt-1">
                      <ChapterSelector
                        currentChapter={chapter}
                        allChapters={allChapters}
                        onSelectChapter={(newId) => onChangeChapterForGroup(chapter.id, newId)}
                        onAddNewChapter={onAddNewChapter}
                        onDeleteChapter={() => onDeleteChapter(chapter.id, chapter.name)}
                      />
                    </div>
                  </td>
                )}

                {/* 3, 4, 5, 6, 7: Đơn vị kiến thức, CLO, NB, TH, VD */}
                <MatrixKnowledgeRow
                  unit={unit}
                  chapter={chapter}
                  courseCLOs={courseCLOs}
                  validation={unitValidationMap[unit.id]}
                  onUpdateUnit={onUpdateUnit}
                  onAddNewUnit={(name) => onAddUnitToChapter(chapter.id, name)}
                  onDeleteUnit={onDeleteUnit}
                  onUnassignCLO={onUnassignCLO}
                />
              </tr>
            );
          })}

          {/* Bottom row of this chapter: "+ Thêm yêu cầu" dashed button row */}
          <tr className="border-b-2 border-slate-300 bg-white/40">
            {/* Columns 1 & 2 are spanned by the first row */}

            {/* Column 3: "+ Thêm yêu cầu" button */}
            <td className="px-3 py-2 align-middle border-r border-slate-200">
              {isAddingInline ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Nhập tên yêu cầu cần đạt / đơn vị kiến thức..."
                    value={newUnitName}
                    onChange={(e) => setNewUnitName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:border-[var(--primary)] focus:outline-none w-full bg-white shadow-2xs font-medium"
                  />
                  <button
                    type="button"
                    onClick={handleSaveInline}
                    className="p-1.5 rounded-lg text-white font-bold cursor-pointer shrink-0"
                    style={{ backgroundColor: 'var(--primary)' }}
                    title="Lưu"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingInline(false);
                      setNewUnitName('');
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer shrink-0"
                    title="Hủy"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingInline(true)}
                  className="w-full py-1.5 px-3 border border-dashed rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer hover:bg-slate-50"
                  style={{
                    borderColor: 'var(--primary)',
                    color: 'var(--primary)',
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Thêm yêu cầu</span>
                </button>
              )}
            </td>

            {/* Column 4: Blank placeholder for CLO */}
            <td className="px-3 py-2 align-middle border-r border-slate-200"></td>

            {/* Columns 5, 6, 7: Blank bloom placeholders (completely empty) */}
            <td className="px-2 py-2 border-r border-slate-200"></td>
            <td className="px-2 py-2 border-r border-slate-200"></td>
            <td className="px-2 py-2"></td>
          </tr>
        </>
      )}
    </>
  );
};
