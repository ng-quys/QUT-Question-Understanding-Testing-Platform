import React, { useState } from 'react';
import {
  Search,
  Filter,
  FileSpreadsheet,
  Download,
  Eye,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  FileText,
  Printer,
  X,
  Radio,
  Plus,
} from 'lucide-react';
import { RECENT_EXAMS_DATA } from '../../../data/mockDashboardData';
import { ExamRecord, ExamStatus, Course, CourseChapter, CourseCLO, QuestionItem } from '../../../types';
import { ObeExamBuilder } from './ObeExamBuilder';

interface ExamManagementPageProps {
  courses: Course[];
  chapters: CourseChapter[];
  clos: CourseCLO[];
  questions: QuestionItem[];
  onUpdateQuestions: React.Dispatch<React.SetStateAction<QuestionItem[]>>;
  onCreateSessionFromExam: (examTitle: string) => void;
  onShowToast: (msg: string) => void;
  onNavigateToWizard?: () => void;
  initialCreateMode?: boolean;
}

export const ExamManagementPage: React.FC<ExamManagementPageProps> = ({
  courses,
  chapters,
  clos,
  questions,
  onUpdateQuestions,
  onCreateSessionFromExam,
  onShowToast,
  onNavigateToWizard,
  initialCreateMode = false,
}) => {
  const [isCreatingObeExam, setIsCreatingObeExam] = useState<boolean>(initialCreateMode);
  const [examsList, setExamsList] = useState<ExamRecord[]>(RECENT_EXAMS_DATA);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState('all');
  const [detailExam, setDetailExam] = useState<ExamRecord | null>(null);

  // If in 4-step OBE exam builder mode, render dedicated workflow
  if (isCreatingObeExam) {
    return (
      <ObeExamBuilder
        courses={courses}
        chapters={chapters}
        clos={clos}
        questions={questions}
        onUpdateQuestions={onUpdateQuestions}
        onSaveExam={(newExam) => {
          setExamsList((prev) => [newExam, ...prev]);
          setIsCreatingObeExam(false);
          onShowToast(`Đã xuất bản đề thi "${newExam.title}" thành công!`);
        }}
        onCancel={() => setIsCreatingObeExam(false)}
        onShowToast={onShowToast}
        onNavigateToOnlineSession={(examTitle) => {
          setIsCreatingObeExam(false);
          onCreateSessionFromExam(examTitle);
        }}
      />
    );
  }

  const filteredExams = examsList.filter((exam) => {
    const matchesStatus = filterStatus === 'all' || exam.status === filterStatus;
    const matchesSearch =
      exam.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      exam.subject.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesCourse =
      selectedCourseFilter === 'all' ||
      exam.subject.toLowerCase().includes(selectedCourseFilter.toLowerCase());
    return matchesStatus && matchesSearch && matchesCourse;
  });

  const renderStatusBadge = (status: ExamStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Đã nghiệm thu
          </span>
        );
      case 'upcoming':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Clock className="w-3 h-3 text-indigo-600" />
            Sắp thi
          </span>
        );
      case 'ongoing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            Đang tổ chức thi
          </span>
        );
      default:
        return null;
    }
  };

  const handleExportWord = (examTitle: string) => {
    onShowToast(`Đang kết xuất và tải tệp đề thi Word (.docx): ${examTitle}`);
    const content = `BỘ GIÁO DỤC VÀ ĐÀO TẠO\nTRƯỜNG ĐẠI HỌC CÔNG NGHỆ THÔNG TIN\nKHOA CÔNG NGHỆ THÔNG TIN\n\nĐỀ THI KẾT THÚC HỌC PHẦN (CHUẨN OBE)\nTên đề: ${examTitle}\nMôn thi: ${examTitle}\nThời gian làm bài: 60 phút (Không kể thời gian phát đề)\n\nHọ và tên: ....................................................\nMSSV: ........................................................\n\n---\nNỘI DUNG ĐỀ THI TRẮC NGHIỆM VÀ PHÂN BỔ CHUẨN ĐẦU RA CLO...\n\n=========================================================\nBẢNG ĐÁP ÁN CHÍNH THỨC (ANSWER KEY)\nCâu 1: A | Câu 2: C | Câu 3: B | Câu 4: D | Câu 5: A\n`;
    const blob = new Blob([content], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `De_thi_OBE_${examTitle.replace(/\s+/g, '_')}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = (examTitle: string) => {
    onShowToast(`Đang chuẩn bị bản in PDF chuẩn học kỳ cho đề: ${examTitle}`);
    window.print();
  };

  return (
    <div className="space-y-5 pb-10 animate-in fade-in duration-150">
      {/* 1. Header Page */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">
              Quản lý đề thi
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Danh sách đề thi chính thức, kiểm duyệt nội dung, xem chi tiết và xuất bản in Word/PDF
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onNavigateToWizard && (
            <button
              type="button"
              onClick={onNavigateToWizard}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>Trình hướng dẫn 5 bước</span>
            </button>
          )}

          {/* Nút Tạo đề thi chuẩn theo Ma trận OBE */}
          <button
            type="button"
            onClick={() => setIsCreatingObeExam(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white shadow-xs transition-transform active:scale-[0.98] cursor-pointer"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>+ Tạo đề thi theo Ma trận OBE</span>
          </button>
        </div>
      </div>

      {/* 2. Overview Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Tổng số đề thi
          </span>
          <div className="text-xl font-bold text-slate-900 mt-1 font-['Plus_Jakarta_Sans',sans-serif]">
            {examsList.length}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Đầy đủ mã đề hoán vị</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">
            Đã nghiệm thu
          </span>
          <div className="text-xl font-bold text-emerald-800 mt-1 font-['Plus_Jakarta_Sans',sans-serif]">
            {examsList.filter((e) => e.status === 'completed').length}
          </div>
          <span className="text-[10px] text-emerald-600 mt-0.5 block">Chuẩn hóa Ma trận OBE</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
          <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block">
            Đang tổ chức thi
          </span>
          <div className="text-xl font-bold text-amber-800 mt-1 font-['Plus_Jakarta_Sans',sans-serif]">
            {examsList.filter((e) => e.status === 'ongoing').length}
          </div>
          <span className="text-[10px] text-amber-600 mt-0.5 block">Đang mở ca trực tuyến</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
          <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider block">
            Sắp diễn ra
          </span>
          <div className="text-xl font-bold text-indigo-800 mt-1 font-['Plus_Jakarta_Sans',sans-serif]">
            {examsList.filter((e) => e.status === 'upcoming').length}
          </div>
          <span className="text-[10px] text-indigo-600 mt-0.5 block">Lịch thi học kỳ</span>
        </div>
      </div>

      {/* 3. Filter & Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-lg text-xs font-semibold overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              filterStatus === 'all'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tất cả ({examsList.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('ongoing')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              filterStatus === 'ongoing'
                ? 'bg-white text-amber-800 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Đang thi
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('upcoming')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              filterStatus === 'upcoming'
                ? 'bg-white text-indigo-800 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sắp tới
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('completed')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              filterStatus === 'completed'
                ? 'bg-white text-emerald-800 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Đã xong
          </button>
        </div>

        {/* Course Filter & Search */}
        <div className="flex items-center gap-2 flex-1 sm:justify-end">
          <select
            value={selectedCourseFilter}
            onChange={(e) => setSelectedCourseFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          >
            <option value="all">Tất cả môn học</option>
            {courses.map((c) => (
              <option key={c.id} value={c.name}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>

          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Tìm theo tên đề thi, mã môn..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[var(--primary)] text-slate-800"
            />
          </div>
        </div>
      </div>

      {/* 4. Exams Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4 sm:px-6">Tên đề thi & Cấu trúc</th>
                <th className="py-3 px-3">Học phần</th>
                <th className="py-3 px-3 text-center">Mã đề hoán vị</th>
                <th className="py-3 px-3 text-center">Thời lượng</th>
                <th className="py-3 px-3">Trạng thái</th>
                <th className="py-3 px-3">Ngày thi</th>
                <th className="py-3 px-4 sm:px-6 text-right">Xuất file & Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredExams.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    <p>Không tìm thấy đề thi nào phù hợp với bộ lọc hiện tại.</p>
                    <button
                      type="button"
                      onClick={() => setIsCreatingObeExam(true)}
                      className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Tạo đề thi mới ngay bây giờ</span>
                    </button>
                  </td>
                </tr>
              ) : (
                filteredExams.map((exam) => (
                  <tr
                    key={exam.id}
                    className="hover:bg-slate-50/70 transition-colors group cursor-default"
                  >
                    {/* Tên đề thi */}
                    <td className="py-3.5 px-4 sm:px-6">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 border border-indigo-100">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div
                            onClick={() => setDetailExam(exam)}
                            className="font-bold text-slate-900 hover:text-[var(--primary)] transition-colors cursor-pointer truncate max-w-[280px]"
                            title={exam.title}
                          >
                            {exam.title}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {exam.questionCount} câu trắc nghiệm • Thang điểm 10.0
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Môn học */}
                    <td className="py-3.5 px-3">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold border border-slate-200/60">
                        {exam.subject}
                      </span>
                    </td>

                    {/* Mã đề hoán vị */}
                    <td className="py-3.5 px-3 text-center">
                      <div className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-slate-700">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">101</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">102</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">103</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">104</span>
                      </div>
                    </td>

                    {/* Thời lượng */}
                    <td className="py-3.5 px-3 text-center font-medium text-slate-600">
                      <div className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{exam.durationMinutes} phút</span>
                      </div>
                    </td>

                    {/* Trạng thái */}
                    <td className="py-3.5 px-3">
                      {renderStatusBadge(exam.status)}
                    </td>

                    {/* Ngày thi */}
                    <td className="py-3.5 px-3 text-slate-500 font-medium">
                      <div className="flex items-center gap-1 text-[11px]">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{exam.examDate}</span>
                      </div>
                    </td>

                    {/* Xuất file & Thao tác */}
                    <td className="py-3.5 px-4 sm:px-6 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Xuất Word */}
                        <button
                          type="button"
                          onClick={() => handleExportWord(exam.title)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-[11px] font-semibold transition-colors cursor-pointer"
                          title="Xuất file Word (.docx) kèm đáp án"
                        >
                          <Download className="w-3 h-3" />
                          <span>Word</span>
                        </button>

                        {/* Xuất PDF */}
                        <button
                          type="button"
                          onClick={() => handleExportPdf(exam.title)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 text-[11px] font-semibold transition-colors cursor-pointer"
                          title="Xuất file PDF / Bản in chuẩn thi"
                        >
                          <Printer className="w-3 h-3" />
                          <span>PDF</span>
                        </button>

                        {/* Xem chi tiết */}
                        <button
                          type="button"
                          onClick={() => setDetailExam(exam)}
                          className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Xem chi tiết đề thi"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Tạo ca thi */}
                        <button
                          type="button"
                          onClick={() => onCreateSessionFromExam(exam.title)}
                          className="p-1.5 rounded text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                          title="Tổ chức ca thi trực tuyến từ đề này"
                        >
                          <Radio className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Hiển thị {filteredExams.length} / {examsList.length} đề thi</span>
          <span className="text-[11px] text-slate-400">Định dạng xuất bản chuẩn Bộ Giáo dục & Đào tạo</span>
        </div>
      </div>

      {/* Detail Modal */}
      {detailExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setDetailExam(null)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col z-10 animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {detailExam.subject}
                  </span>
                  <span className="text-xs text-slate-400">•</span>
                  <span className="text-xs text-slate-500 font-medium">Mã đề: 101, 102, 103, 104</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {detailExam.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailExam(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Số lượng câu</span>
                  <span className="font-bold text-slate-900 text-sm">{detailExam.questionCount} câu</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Thời gian</span>
                  <span className="font-bold text-slate-900 text-sm">{detailExam.durationMinutes} phút</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Trạng thái</span>
                  <span className="font-bold text-emerald-700 text-sm">Đã nghiệm thu</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1.5 uppercase text-[11px] tracking-wider">
                  Cấu trúc phân bổ Ma trận OBE
                </h4>
                <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Mức Nhận biết (Remember):</span>
                    <span className="font-bold text-emerald-700">30% (Thang điểm 3.0)</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Mức Thông hiểu (Understand):</span>
                    <span className="font-bold text-blue-700">40% (Thang điểm 4.0)</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Mức Vận dụng (Apply):</span>
                    <span className="font-bold text-indigo-700">30% (Thang điểm 3.0)</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1.5 uppercase text-[11px] tracking-wider">
                  Mã đề hoán vị và Đáp án
                </h4>
                <p className="text-slate-500 leading-relaxed">
                  Đề thi đã được trộn ngẫu nhiên thành 4 mã đề (101, 102, 103, 104) với cơ chế tự động hoán vị thứ tự câu hỏi và 4 phương án A, B, C, D. Bảng đáp án tương ứng sẵn sàng kết xuất kèm theo file Word hoặc PDF.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
              <button
                type="button"
                onClick={() => onCreateSessionFromExam(detailExam.title)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-2xs"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Mở ca thi từ đề này</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExportWord(detailExam.title)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  <span>Xuất Word (.docx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportPdf(detailExam.title)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
                >
                  <Printer className="w-3.5 h-3.5 text-rose-600" />
                  <span>Xuất PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
