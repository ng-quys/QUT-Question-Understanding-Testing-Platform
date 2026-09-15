import React from 'react';
import { MatrixSummaryStats } from './types';

export interface MatrixSummaryProps {
  summary: MatrixSummaryStats;
  bloomGuidance?: {
    nb: number;
    th: number;
    vd: number;
  };
  onUpdateBloomGuidance?: (newGuidance: { nb: number; th: number; vd: number }) => void;
  enableDistributionControl?: boolean;
  pointsMode?: 'equal' | 'by_section';
  onChangePointsMode?: (mode: 'equal' | 'by_section') => void;
}

export const MatrixSummary: React.FC<MatrixSummaryProps> = ({ summary }) => {
  const total = summary.matrixTotal || 0;

  return (
    <tfoot className="border-t-2 border-slate-300 text-slate-800 sticky bottom-0 z-20 shadow-2xs">
      {/* ROW: TỔNG SỐ CÂU HỎI THỰC TẾ TRONG MA TRẬN */}
      <tr className="font-bold text-xs bg-slate-50 border-b border-slate-200">
        <td
          colSpan={4}
          className="px-4 py-3 text-right uppercase tracking-wider text-slate-700 font-bold border-r border-slate-200"
        >
          <div className="flex items-center justify-end gap-2">
            <span>TỔNG SỐ CÂU HỎI</span>
            <span className="px-2.5 py-0.5 rounded text-[11px] bg-slate-200/80 text-slate-800 font-mono font-bold">
              {total} câu
            </span>
          </div>
        </td>

        {/* Total NB */}
        <td className="px-2 py-3 text-center border-r border-slate-200 whitespace-nowrap">
          <div className="font-extrabold text-xs text-emerald-800">
            {summary.totalNB} câu
          </div>
          {total > 0 && (
            <div className="text-[10px] text-slate-400 font-normal">
              {Math.round((summary.totalNB / total) * 100)}% thực tế
            </div>
          )}
        </td>

        {/* Total TH */}
        <td className="px-2 py-3 text-center border-r border-slate-200 whitespace-nowrap">
          <div className="font-extrabold text-xs text-blue-800">
            {summary.totalTH} câu
          </div>
          {total > 0 && (
            <div className="text-[10px] text-slate-400 font-normal">
              {Math.round((summary.totalTH / total) * 100)}% thực tế
            </div>
          )}
        </td>

        {/* Total VD */}
        <td className="px-2 py-3 text-center whitespace-nowrap">
          <div className="font-extrabold text-xs text-indigo-800">
            {summary.totalVD} câu
          </div>
          {total > 0 && (
            <div className="text-[10px] text-slate-400 font-normal">
              {Math.round((summary.totalVD / total) * 100)}% thực tế
            </div>
          )}
        </td>
      </tr>
    </tfoot>
  );
};

export interface MatrixSummaryBottomBarProps {
  summary: MatrixSummaryStats;
  bloomGuidance?: {
    nb: number;
    th: number;
    vd: number;
  };
  enableDistributionControl?: boolean;
  pointsMode?: 'equal' | 'by_section';
  onChangePointsMode?: (mode: 'equal' | 'by_section') => void;
}

export const MatrixSummaryBottomBar: React.FC<MatrixSummaryBottomBarProps> = ({
  summary,
}) => {
  return (
    <div className="p-3.5 sm:p-4 border-t bg-white border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      {/* Left: Horizontal scannable summary in 1 line: Chỉ hiển thị số lượng câu hỏi */}
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs">
        <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
          TỔNG CỘNG:
        </span>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>
            Nhận biết: <strong>{summary.totalNB} câu</strong>
          </span>
        </div>
        <span className="text-slate-300 font-light hidden sm:inline">|</span>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200/80">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          <span>
            Thông hiểu: <strong>{summary.totalTH} câu</strong>
          </span>
        </div>
        <span className="text-slate-300 font-light hidden sm:inline">|</span>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200/80">
          <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
          <span>
            Vận dụng: <strong>{summary.totalVD} câu</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
