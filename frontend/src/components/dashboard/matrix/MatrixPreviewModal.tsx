import React from 'react';
import { X, Printer, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { Course, CourseChapter, CourseCLO } from '../../../types';
import { MatrixKnowledgeUnit, MatrixSummaryStats } from './types';
import { calculateRowTotal, calculateRowPercentage } from './matrixLogic';

interface MatrixPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: Course | undefined;
  chapters: CourseChapter[];
  units: MatrixKnowledgeUnit[];
  clos: CourseCLO[];
  summary: MatrixSummaryStats;
  aiInstruction?: string;
  onExportExcel: () => void;
}

export const MatrixPreviewModal: React.FC<MatrixPreviewModalProps> = ({
  isOpen,
  onClose,
  course,
  chapters,
  units,
  clos,
  summary,
  aiInstruction,
  onExportExcel,
}) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const courseChaps = chapters.filter((c) => !course || c.courseId === course.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl my-auto overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Xem trước cấu trúc
            </span>
            <h3 className="text-sm font-bold text-slate-900">
              Khung Ma trận Câu hỏi: {course?.code} — {course?.name}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-white text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>In ma trận</span>
            </button>
            <button
              type="button"
              onClick={onExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-white text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Xuất Excel</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
          {/* Metadata banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">HỌC PHẦN</span>
              <strong className="text-slate-900 font-bold">{course?.name}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">TỔNG SỐ CÂU</span>
              <strong className="text-slate-900 font-bold">{summary.matrixTotal} câu</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">TỶ LỆ MỨC ĐỘ</span>
              <span className="font-semibold text-slate-700">
                NB {summary.percentNB}% • TH {summary.percentTH}% • VD {summary.percentVD}%
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">TRẠNG THÁI</span>
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                <CheckCircle2 className="w-3 h-3" /> Đã hoàn thiện
              </span>
            </div>
          </div>

          {/* Matrix table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-bold">
                <tr>
                  <th className="px-3 py-2.5 text-center w-10">TT</th>
                  <th className="px-3 py-2.5">Chương / Chủ đề</th>
                  <th className="px-3 py-2.5">Đơn vị kiến thức</th>
                  <th className="px-3 py-2.5">CLO</th>
                  <th className="px-2 py-2.5 text-center">NB</th>
                  <th className="px-2 py-2.5 text-center">TH</th>
                  <th className="px-2 py-2.5 text-center">VD</th>
                  <th className="px-3 py-2.5 text-center">Tổng</th>
                  <th className="px-3 py-2.5 text-center">Tỉ lệ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {courseChaps.flatMap((chap) => {
                  const chapUnits = units.filter((u) => u.chapterId === chap.id);
                  return chapUnits.map((u, idx) => {
                    const clo = clos.find((c) => c.id === u.cloId);
                    const rowTotal = calculateRowTotal(u);
                    const pct = calculateRowPercentage(rowTotal, summary.matrixTotal);

                    return (
                      <tr key={u.id} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2 text-center text-slate-400 text-[11px]">
                          {units.indexOf(u) + 1}
                        </td>
                        {idx === 0 && (
                          <td
                            rowSpan={chapUnits.length}
                            className="px-3 py-2 font-bold text-slate-800 align-top bg-white border-r border-slate-100"
                          >
                            <span className="text-[10px] text-slate-500 block">{chap.code}</span>
                            {chap.name}
                          </td>
                        )}
                        <td className="px-3 py-2 font-medium text-slate-900">{u.name}</td>
                        <td className="px-3 py-2 text-slate-600">
                          <span className="font-bold text-[10px] text-[var(--primary)] bg-slate-100 px-1 py-0.5 rounded">
                            {clo?.code || '—'}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center text-emerald-700 font-bold">{u.nb}</td>
                        <td className="px-2 py-2 text-center text-blue-700 font-bold">{u.th}</td>
                        <td className="px-2 py-2 text-center text-indigo-700 font-bold">{u.vd}</td>
                        <td className="px-3 py-2 text-center font-extrabold text-slate-900">
                          {rowTotal}
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-slate-500">{pct}</td>
                      </tr>
                    );
                  });
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                <tr>
                  <td colSpan={4} className="px-3 py-2.5 text-right uppercase text-slate-600">
                    TỔNG CỘNG
                  </td>
                  <td className="px-2 py-2.5 text-center text-emerald-800">{summary.totalNB}</td>
                  <td className="px-2 py-2.5 text-center text-blue-800">{summary.totalTH}</td>
                  <td className="px-2 py-2.5 text-center text-indigo-800">{summary.totalVD}</td>
                  <td className="px-3 py-2.5 text-center font-black text-slate-900">
                    {summary.matrixTotal}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* AI Note if present */}
          {aiInstruction && (
            <div className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200/60 text-xs">
              <span className="font-bold text-amber-900 block mb-1">
                Yêu cầu trọng tâm bổ sung cho AI:
              </span>
              <p className="text-slate-700 whitespace-pre-wrap">{aiInstruction}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white rounded-xl shadow-2xs cursor-pointer"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            Đóng xem trước
          </button>
        </div>
      </div>
    </div>
  );
};
