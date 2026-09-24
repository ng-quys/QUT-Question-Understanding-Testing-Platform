import React, { useState } from 'react';
import {
  Search,
  Filter,
  MoreVertical,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  Radio,
  FileSpreadsheet,
  Download,
  Eye,
  ArrowUpDown,
  FileText,
} from 'lucide-react';
import { RECENT_EXAMS_DATA } from '../../data/mockDashboardData';
import type{ ExamRecord, ExamStatus } from '../../types';

interface RecentExamsTableProps {
  onViewExamDetail?: (exam: ExamRecord) => void;
}

export const RecentExamsTable: React.FC<RecentExamsTableProps> = ({
  onViewExamDetail,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const filteredExams = RECENT_EXAMS_DATA.filter((exam) => {
    const matchesStatus = filterStatus === 'all' || exam.status === filterStatus;
    const matchesSearch =
      exam.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      exam.subject.toLowerCase().includes(searchFilter.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const renderStatusBadge = (status: ExamStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Hoàn thành
          </span>
        );
      case 'upcoming':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Clock className="w-3 h-3 text-indigo-600" />
            Sắp diễn ra
          </span>
        );
      case 'ongoing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            Đang diễn ra
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Table Header & Controls */}
      <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 font-['Space_Grotesk'] tracking-tight">
              Kỳ thi gần đây
            </h3>
            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
              {filteredExams.length} kỳ thi
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Danh sách các bài thi trắc nghiệm theo môn học và tiến độ tổ chức
          </p>
        </div>

        {/* Filter Pills & Quick Search */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Filter Tabs */}
          <div className="flex items-center p-1 bg-slate-100/80 rounded-xl text-xs font-medium">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterStatus === 'all'
                  ? 'bg-white text-slate-900 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setFilterStatus('ongoing')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterStatus === 'ongoing'
                  ? 'bg-white text-amber-700 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Đang thi
            </button>
            <button
              onClick={() => setFilterStatus('upcoming')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterStatus === 'upcoming'
                  ? 'bg-white text-indigo-700 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sắp tới
            </button>
            <button
              onClick={() => setFilterStatus('completed')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterStatus === 'completed'
                  ? 'bg-white text-emerald-700 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Đã xong
            </button>
          </div>

          {/* Search box inside table */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Lọc môn, tên đề..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800"
            />
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <th className="py-3 px-5 sm:px-6">Tên kỳ thi</th>
              <th className="py-3 px-4">Môn học</th>
              <th className="py-3 px-4 text-center">Sinh viên</th>
              <th className="py-3 px-4 text-center">Điểm TB</th>
              <th className="py-3 px-4">Trạng thái</th>
              <th className="py-3 px-4">Ngày thi</th>
              <th className="py-3 px-5 sm:px-6 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filteredExams.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                  Không tìm thấy kỳ thi nào phù hợp với bộ lọc.
                </td>
              </tr>
            ) : (
              filteredExams.map((exam) => (
                <tr
                  key={exam.id}
                  className="hover:bg-slate-50/70 transition-colors group cursor-default"
                >
                  {/* Tên kỳ thi */}
                  <td className="py-3.5 px-5 sm:px-6 font-bold text-slate-900">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 hover:text-indigo-600 transition-colors">
                          {exam.title}
                        </div>
                        <div className="text-[11px] text-slate-400 font-normal">
                          {exam.questionCount} câu • {exam.durationMinutes} phút
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Môn học */}
                  <td className="py-3.5 px-4 text-xs font-semibold text-slate-700">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                      {exam.subject}
                    </span>
                  </td>

                  {/* Sinh viên */}
                  <td className="py-3.5 px-4 text-center">
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{exam.studentCount}</span>
                    </div>
                  </td>

                  {/* Điểm TB */}
                  <td className="py-3.5 px-4 text-center">
                    {exam.avgScore !== null ? (
                      <span className="inline-block px-2.5 py-0.5 rounded-md font-bold text-xs bg-indigo-50 text-indigo-700 font-['Space_Grotesk']">
                        {exam.avgScore.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-slate-300 font-bold">—</span>
                    )}
                  </td>

                  {/* Trạng thái */}
                  <td className="py-3.5 px-4">
                    {renderStatusBadge(exam.status)}
                  </td>

                  {/* Ngày thi */}
                  <td className="py-3.5 px-4 text-xs text-slate-500 font-medium">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{exam.examDate}</span>
                    </div>
                  </td>

                  {/* Thao tác */}
                  <td className="py-3.5 px-5 sm:px-6 text-right relative">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onViewExamDetail?.(exam)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="Xem chi tiết đề thi"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => alert(`Đang tải báo cáo phổ điểm cho: ${exam.title}`)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="Xuất bảng điểm"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="px-5 sm:px-6 py-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>Hiển thị {filteredExams.length} kỳ thi gần nhất</span>
        <button
          onClick={() => alert('Chuyển tới module Đề thi đầy đủ')}
          className="text-indigo-600 font-semibold hover:underline cursor-pointer"
        >
          Xem tất cả đề thi &rarr;
        </button>
      </div>
    </div>
  );
};
