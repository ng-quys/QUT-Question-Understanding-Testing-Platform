import React, { useState } from 'react';
import { ChevronDown, ArrowRight, Copy, Check, Link2 } from 'lucide-react';
import type{ ExamActivityItem } from '../../data/dashboardMockData';
import type{ ExamFilterType, TimeRangeType } from '../../hooks/useDashboardData';

interface RecentExamTableProps {
  exams: ExamActivityItem[];
  filterType: ExamFilterType;
  onFilterChange: (type: ExamFilterType) => void;
  timeRange: TimeRangeType;
  onTimeRangeChange: (range: TimeRangeType) => void;
  counts: {
    all: number;
    upcoming: number;
    endingSoon: number;
  };
  onViewExamDetail: (title: string) => void;
  onViewResultsTab: () => void;
  onViewAllExams: () => void;
}

export const RecentExamTable: React.FC<RecentExamTableProps> = ({
  exams,
  filterType,
  onFilterChange,
  timeRange,
  onTimeRangeChange,
  counts,
  onViewExamDetail,
  onViewResultsTab,
  onViewAllExams,
}) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopyLink = (code: string) => {
    const link = `${window.location.origin}/join/${code}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).catch(() => {});
    }
    setCopiedCode(code);
    setTimeout(() => {
      setCopiedCode(null);
    }, 2000);
  };

  return (
    <div className="space-y-4">
      {/* Section Header & Time Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-1 gap-2">
        <div>
          <h2 className="text-[19px] sm:text-[20px] font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif] tracking-tight">
            Hoạt động thi gần đây
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tổng hợp các bài kiểm tra và ca thi trực tuyến gần đây
          </p>
        </div>

        {/* Time range dropdown */}
        <div className="relative inline-block self-start sm:self-auto">
          <select
            value={timeRange}
            onChange={(e) => onTimeRangeChange(e.target.value as TimeRangeType)}
            className="appearance-none bg-white border border-slate-300 text-slate-700 text-xs rounded-md pl-3 pr-8 py-1.5 focus:outline-none focus:border-[var(--primary)] cursor-pointer font-medium"
          >
            <option value="7-days">7 ngày gần nhất</option>
            <option value="14-days">14 ngày gần nhất</option>
            <option value="30-days">30 ngày gần nhất</option>
            <option value="semester">Học kỳ 1 (2026-2027)</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Status Tabs - ClassMarker Flat Style */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-5 sm:gap-6">
          <button
            type="button"
            onClick={() => onFilterChange('recent')}
            className={`py-2 text-[13px] sm:text-sm font-medium transition-colors cursor-pointer relative -mb-[1px] ${
              filterType === 'recent'
                ? 'font-bold text-slate-900 border-b-2'
                : 'text-slate-600 hover:text-[var(--primary)]'
            }`}
            style={
              filterType === 'recent'
                ? { borderColor: 'var(--primary)', color: 'var(--primary)' }
                : undefined
            }
          >
            Tất cả gần đây
            <span className="ml-1 text-xs font-normal text-slate-400">
              ({counts.all})
            </span>
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('upcoming')}
            className={`py-2 text-[13px] sm:text-sm font-medium transition-colors cursor-pointer relative -mb-[1px] ${
              filterType === 'upcoming'
                ? 'font-bold text-slate-900 border-b-2'
                : 'text-slate-600 hover:text-[var(--primary)]'
            }`}
            style={
              filterType === 'upcoming'
                ? { borderColor: 'var(--primary)', color: 'var(--primary)' }
                : undefined
            }
          >
            Sắp diễn ra
            <span className="ml-1 text-xs font-normal text-slate-400">
              ({counts.upcoming})
            </span>
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('ending-soon')}
            className={`py-2 text-[13px] sm:text-sm font-medium transition-colors cursor-pointer relative -mb-[1px] ${
              filterType === 'ending-soon'
                ? 'font-bold text-slate-900 border-b-2'
                : 'text-slate-600 hover:text-[var(--primary)]'
            }`}
            style={
              filterType === 'ending-soon'
                ? { borderColor: 'var(--primary)', color: 'var(--primary)' }
                : undefined
            }
          >
            Sắp kết thúc
            <span className="ml-1 text-xs font-normal text-slate-400">
              ({counts.endingSoon})
            </span>
          </button>
        </div>

        <span className="text-[11px] text-slate-400 font-medium hidden sm:inline pb-1">
          Cập nhật 2 phút trước
        </span>
      </div>

      {/* Activity Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 px-4">Tên đề thi & Học phần</th>
                <th className="py-2.5 px-3">Mã ca thi / Link</th>
                <th className="py-2.5 px-3">Tiến độ nộp bài</th>
                <th className="py-2.5 px-3">Thời gian</th>
                <th className="py-2.5 px-3">Trạng thái</th>
                <th className="py-2.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exams.map((exam) => {
                return (
                  <tr
                    key={exam.id}
                    className="hover:bg-slate-50/70 transition-colors group"
                  >
                    <td className="py-3 px-4">
                      <div
                        className="font-semibold text-slate-900 group-hover:text-[var(--primary)] transition-colors"
                      >
                        {exam.title}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Mã học phần: {exam.courseCode}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center font-mono font-semibold text-xs text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 tracking-wide">
                          {exam.examCode}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyLink(exam.examCode);
                          }}
                          className={`p-1 rounded transition-colors cursor-pointer ${
                            copiedCode === exam.examCode
                              ? 'text-emerald-700 bg-emerald-50'
                              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                          }`}
                          title={`Sao chép link: /join/${exam.examCode}`}
                          aria-label={`Sao chép link ca thi ${exam.examCode}`}
                        >
                          {copiedCode === exam.examCode ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 text-xs">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            exam.submissionCount > 0 ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        />
                        <span>
                          {exam.submissionCount > 0 ? (
                            <>
                              Đã nộp: <strong>{exam.submissionCount}</strong> lượt
                            </>
                          ) : (
                            <span className="text-slate-400">Chưa có bài nộp</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 text-xs">
                      {exam.timeLabel}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${exam.statusBadge.className}`}
                      >
                        {exam.statusBadge.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (exam.actionText === 'Xem kết quả') {
                            onViewResultsTab();
                          } else {
                            onViewExamDetail(exam.title);
                          }
                        }}
                        className="text-xs font-semibold hover:underline cursor-pointer"
                        style={{ color: 'var(--primary)' }}
                      >
                        {exam.actionText}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-2.5 bg-slate-50/50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Đồng bộ từ hệ thống khảo thí</span>
          <button
            type="button"
            onClick={onViewAllExams}
            className="font-medium hover:underline flex items-center gap-1 cursor-pointer"
            style={{ color: 'var(--primary)' }}
          >
            Xem toàn bộ đề thi
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
