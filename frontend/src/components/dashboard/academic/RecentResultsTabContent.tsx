import React, { useState } from 'react';
import {
  Search,
  Filter,
  ChevronDown,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Award,
  BookOpen,
} from 'lucide-react';

interface StudentResultItem {
  id: string;
  studentName: string;
  studentId: string;
  examTitle: string;
  subject: string;
  score: number;
  percentage: string;
  duration: string;
  date: string;
  passed: boolean;
}

const MOCK_RESULTS: StudentResultItem[] = [
  {
    id: 'RES-01',
    studentName: 'Trần Minh Trí',
    studentId: '21020412',
    examTitle: 'Kiểm tra giữa kỳ CSDL',
    subject: 'Cơ sở dữ liệu',
    score: 8.5,
    percentage: '85% (34/40)',
    duration: '42 phút',
    date: '08/09/2026',
    passed: true,
  },
  {
    id: 'RES-02',
    studentName: 'Lê Thị Thảo Vy',
    studentId: '21020589',
    examTitle: 'Kiểm tra giữa kỳ CSDL',
    subject: 'Cơ sở dữ liệu',
    score: 9.0,
    percentage: '90% (36/40)',
    duration: '38 phút',
    date: '08/09/2026',
    passed: true,
  },
  {
    id: 'RES-03',
    studentName: 'Đặng Quỳnh Mai',
    studentId: '21020655',
    examTitle: 'Kiểm tra giữa kỳ CSDL',
    subject: 'Cơ sở dữ liệu',
    score: 9.5,
    percentage: '95% (38/40)',
    duration: '35 phút',
    date: '08/09/2026',
    passed: true,
  },
  {
    id: 'RES-04',
    studentName: 'Nguyễn Hoàng Nam',
    studentId: '21020114',
    examTitle: 'Kiểm tra 15 phút Trí tuệ nhân tạo',
    subject: 'Trí tuệ nhân tạo',
    score: 7.5,
    percentage: '75% (15/20)',
    duration: '14 phút',
    date: '07/09/2026',
    passed: true,
  },
  {
    id: 'RES-05',
    studentName: 'Vũ Đăng Khoa',
    studentId: '21020332',
    examTitle: 'Lập trình Web - Quiz 2',
    subject: 'Phát triển Web',
    score: 8.0,
    percentage: '80% (24/30)',
    duration: '28 phút',
    date: '06/09/2026',
    passed: true,
  },
  {
    id: 'RES-06',
    studentName: 'Phạm Thanh Hương',
    studentId: '21020780',
    examTitle: 'Lập trình Web - Quiz 2',
    subject: 'Phát triển Web',
    score: 6.5,
    percentage: '65% (19/30)',
    duration: '29 phút',
    date: '06/09/2026',
    passed: true,
  },
  {
    id: 'RES-07',
    studentName: 'Hoàng Quốc Bảo',
    studentId: '21020901',
    examTitle: 'Cấu trúc dữ liệu & Giải thuật',
    subject: 'CTDL & Giải thuật',
    score: 7.0,
    percentage: '70% (28/40)',
    duration: '52 phút',
    date: '05/09/2026',
    passed: true,
  },
];

interface RecentResultsTabContentProps {
  onViewStudentDetail: (studentName: string) => void;
}

export const RecentResultsTabContent: React.FC<RecentResultsTabContentProps> = ({
  onViewStudentDetail,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [examFilter, setExamFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('30-days');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredResults = MOCK_RESULTS.filter((r) => {
    const matchesSearch =
      r.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.studentId.includes(searchTerm);
    const matchesExam = examFilter === 'all' || r.examTitle.includes(examFilter);
    return matchesSearch && matchesExam;
  });

  return (
    <div className="space-y-5 pt-4">
      {/* Compact Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-md border flex items-center justify-center"
            style={{
              backgroundColor: 'var(--primary-light)',
              borderColor: 'var(--primary-border)',
              color: 'var(--primary)',
            }}
          >
            <Award className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs text-slate-500">Điểm trung bình</div>
            <div className="text-lg font-bold text-slate-900 tracking-tight">7.8 / 10</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs text-slate-500">Tỷ lệ đạt chuẩn</div>
            <div className="text-lg font-bold text-slate-900 tracking-tight">84%</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs text-slate-500">Bài đã chấm</div>
            <div className="text-lg font-bold text-slate-900 tracking-tight">128 bài thi</div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên sinh viên hoặc MSSV..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus:border-[var(--primary)] text-slate-900 placeholder-slate-400"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {/* Filter Exam */}
          <div className="relative">
            <select
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
              className="appearance-none bg-white border border-slate-300 text-slate-700 text-xs rounded-md pl-3 pr-7 py-1.5 focus:outline-none focus:border-[var(--primary)] cursor-pointer"
            >
              <option value="all">Tất cả kỳ thi</option>
              <option value="CSDL">Cơ sở dữ liệu</option>
              <option value="Web">Lập trình Web</option>
              <option value="Trí tuệ nhân tạo">Trí tuệ nhân tạo</option>
              <option value="Cấu trúc">CTDL & Giải thuật</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Filter Time */}
          <div className="relative">
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="appearance-none bg-white border border-slate-300 text-slate-700 text-xs rounded-md pl-3 pr-7 py-1.5 focus:outline-none focus:border-[var(--primary)] cursor-pointer"
            >
              <option value="7-days">7 ngày qua</option>
              <option value="30-days">30 ngày qua</option>
              <option value="semester">Toàn học kỳ</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Results Academic Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-100/75 text-slate-600 font-semibold border-b border-slate-200">
                <th className="py-3 px-4">Sinh viên</th>
                <th className="py-3 px-3">Kỳ thi</th>
                <th className="py-3 px-3 text-center">Điểm</th>
                <th className="py-3 px-3">Tỷ lệ đúng</th>
                <th className="py-3 px-3">Thời gian làm</th>
                <th className="py-3 px-3">Ngày thi</th>
                <th className="py-3 px-4 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Không tìm thấy bài thi nào phù hợp với bộ lọc
                  </td>
                </tr>
              ) : (
                filteredResults.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{item.studentName}</div>
                      <div className="text-[11px] text-slate-500">MSSV: {item.studentId}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-slate-800 font-medium">{item.examTitle}</div>
                      <div className="text-[11px] text-slate-400">{item.subject}</div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-bold ${
                          item.score >= 8.0
                            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200/60'
                            : item.score >= 6.5
                            ? 'border'
                            : 'text-amber-700 bg-amber-50 border border-amber-200/60'
                        }`}
                        style={
                          item.score >= 6.5 && item.score < 8.0
                            ? {
                                color: 'var(--primary)',
                                backgroundColor: 'var(--primary-light)',
                                borderColor: 'var(--primary-border)',
                              }
                            : undefined
                        }
                      >
                        {item.score.toFixed(1)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-700 font-medium">
                      {item.percentage}
                    </td>
                    <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                      {item.duration}
                    </td>
                    <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                      {item.date}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onViewStudentDetail(item.studentName)}
                        className="text-xs font-semibold hover:underline cursor-pointer"
                        style={{ color: 'var(--primary)' }}
                      >
                        Xem bài làm
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination */}
        <div className="p-3 bg-slate-50/50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div>
            Hiển thị <span className="font-semibold text-slate-700">1</span> –{' '}
            <span className="font-semibold text-slate-700">{filteredResults.length}</span> trong số{' '}
            <span className="font-semibold text-slate-700">128</span> kết quả
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Trước
            </button>
            <button
              type="button"
              className="px-2.5 py-1 rounded border text-white font-semibold cursor-pointer"
              style={{ backgroundColor: 'var(--primary)', borderColor: 'var(--primary)' }}
            >
              1
            </button>
            <button
              type="button"
              className="px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              2
            </button>
            <button
              type="button"
              className="px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              3
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => p + 1)}
              className="px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
