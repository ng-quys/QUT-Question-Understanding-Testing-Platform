import React from 'react';
import { CourseCLO, CourseChapter } from '../../../types';
import { MatrixKnowledgeUnit, RowValidation } from './types';
import { BloomCounter } from './BloomCounter';
import { CLOSelector } from './CLOSelector';
import { KnowledgeUnitSelector } from './KnowledgeUnitSelector';

interface MatrixKnowledgeRowProps {
  unit: MatrixKnowledgeUnit;
  chapter: CourseChapter;
  courseCLOs: CourseCLO[];
  validation?: RowValidation;
  onUpdateUnit: (id: string, updates: Partial<MatrixKnowledgeUnit>) => void;
  onAddNewUnit: (name: string) => void;
  onDeleteUnit: (id: string, name: string) => void;
  onUnassignCLO: (id: string, name: string) => void;
}

export const MatrixKnowledgeRow: React.FC<MatrixKnowledgeRowProps> = ({
  unit,
  chapter,
  courseCLOs,
  validation,
  onUpdateUnit,
  onAddNewUnit,
  onDeleteUnit,
  onUnassignCLO,
}) => {
  return (
    <>
      {/* 1. ĐƠN VỊ KIẾN THỨC (With Unit Dropdown + Trash button) */}
      <td className="px-3 py-2.5 align-middle border-r border-slate-200 min-w-[250px]">
        <KnowledgeUnitSelector
          chapter={chapter}
          value={unit.name}
          onChange={(name) => onUpdateUnit(unit.id, { name })}
          onAddNewUnit={onAddNewUnit}
          onDeleteUnit={() => onDeleteUnit(unit.id, unit.name || 'Đơn vị kiến thức')}
          placeholder="-- Chọn đơn vị --"
        />
      </td>

      {/* 2. CHUẨN ĐẦU RA (CLO) (With CLO Dropdown + Trash button) */}
      <td className="px-3 py-2.5 align-middle border-r border-slate-200 min-w-[240px]">
        <CLOSelector
          courseCLOs={courseCLOs}
          selectedCloId={unit.cloId}
          onSelectCLO={(cloId) => onUpdateUnit(unit.id, { cloId })}
          onUnassignCLO={() => onUnassignCLO(unit.id, unit.name || 'Dòng ma trận')}
          hasWarning={validation?.hasNoCLO}
        />
      </td>

      {/* 3. NHẬN BIẾT (NB) */}
      <td className="px-2 py-2.5 text-center align-middle whitespace-nowrap border-r border-slate-200 w-28">
        <BloomCounter
          value={unit.nb}
          onChange={(val) => onUpdateUnit(unit.id, { nb: val })}
          level="nb"
        />
      </td>

      {/* 4. THÔNG HIỂU (TH) */}
      <td className="px-2 py-2.5 text-center align-middle whitespace-nowrap border-r border-slate-200 w-28">
        <BloomCounter
          value={unit.th}
          onChange={(val) => onUpdateUnit(unit.id, { th: val })}
          level="th"
        />
      </td>

      {/* 5. VẬN DỤNG (VD) */}
      <td className="px-2 py-2.5 text-center align-middle whitespace-nowrap w-28">
        <BloomCounter
          value={unit.vd}
          onChange={(val) => onUpdateUnit(unit.id, { vd: val })}
          level="vd"
        />
      </td>
    </>
  );
};
