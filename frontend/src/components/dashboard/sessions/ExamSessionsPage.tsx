import React, { useState } from 'react';
import {
  CalendarClock,
  Plus,
  Search,
  Copy,
  Check,
  QrCode,
  Users,
  Clock,
  ExternalLink,
  Lock,
  Unlock,
  Download,
  FileSpreadsheet,
  X,
  AlertCircle,
  Eye,
  CheckCircle2,
  Share2,
} from 'lucide-react';
import { Course } from '../../../types';

export interface ExamSession {
  id: string;
  code: string;
  title: string;
  courseCode: string;
  courseName: string;
  durationMinutes: number;
  startTime: string;
  endTime: string;
  status: 'active' | 'upcoming' | 'completed';
  submissionCount: number;
  isOpenForSubmissions: boolean;
  shuffleQuestions: boolean;
  instantScore: boolean;
  submissions: StudentSubmission[];
}

export interface StudentSubmission {
  id: string;
  fullName: string;
  studentId: string;
  submittedAt: string;
  durationSpentMinutes: number;
  score: number;
  maxScore: number;
  status: 'graded' | 'pending';
}

const INITIAL_SESSIONS: ExamSession[] = [
  {
    id: 'session-1',
    code: 'AI-MIDTERM-01',
    title: 'Kiểm tra giữa kỳ - Cấu trúc dữ liệu & Giải thuật',
    courseCode: 'CS201',
    courseName: 'Cấu trúc dữ liệu & Giải thuật',
    durationMinutes: 60,
    startTime: '10:00 12/03/2026',
    endTime: '12:00 12/03/2026',
    status: 'active',
    submissionCount: 65,
    isOpenForSubmissions: true,
    shuffleQuestions: true,
    instantScore: true,
    submissions: [
      {
        id: 'sub-1',
        fullName: 'Nguyễn Văn An',
        studentId: 'B21DCCN045',
        submittedAt: '10:48 12/03/2026',
        durationSpentMinutes: 48,
        score: 8.5,
        maxScore: 10,
        status: 'graded',
      },
      {
        id: 'sub-2',
        fullName: 'Trần Thị Thảo Mai',
        studentId: 'B21DCCN120',
        submittedAt: '10:52 12/03/2026',
        durationSpentMinutes: 52,
        score: 9.2,
        maxScore: 10,
        status: 'graded',
      },
      {
        id: 'sub-3',
        fullName: 'Lê Hoàng Nam',
        studentId: 'B22DCCN540',
        submittedAt: '10:40 12/03/2026',
        durationSpentMinutes: 40,
        score: 7.8,
        maxScore: 10,
        status: 'graded',
      },
      {
        id: 'sub-4',
        fullName: 'Phạm Quỳnh Nga',
        studentId: 'B21DCCN389',
        submittedAt: '10:55 12/03/2026',
        durationSpentMinutes: 55,
        score: 8.8,
        maxScore: 10,
        status: 'graded',
      },
      {
        id: 'sub-5',
        fullName: 'Đỗ Minh Quân',
        studentId: 'B22DCCN102',
        submittedAt: '10:58 12/03/2026',
        durationSpentMinutes: 58,
        score: 6.5,
        maxScore: 10,
        status: 'graded',
      },
    ],
  },
  {
    id: 'session-2',
    code: 'WEB-QUIZ-02',
    title: 'Trắc nghiệm tuần 6 - Lập trình Web nâng cao',
    courseCode: 'INT310',
    courseName: 'Lập trình Web nâng cao',
    durationMinutes: 30,
    startTime: '08:00 12/03/2026',
    endTime: '23:59 12/03/2026',
    status: 'active',
    submissionCount: 58,
    isOpenForSubmissions: true,
    shuffleQuestions: true,
    instantScore: true,
    submissions: [
      {
        id: 'sub-21',
        fullName: 'Vũ Đức Thịnh',
        studentId: 'B22DCCN711',
        submittedAt: '14:22 12/03/2026',
        durationSpentMinutes: 24,
        score: 9.0,
        maxScore: 10,
        status: 'graded',
      },
      {
        id: 'sub-22',
        fullName: 'Ngô Thu Hà',
        studentId: 'B21DCCN412',
        submittedAt: '15:10 12/03/2026',
        durationSpentMinutes: 28,
        score: 8.0,
        maxScore: 10,
        status: 'graded',
      },
    ],
  },
  {
    id: 'session-3',
    code: 'DB-QUIZ-15M',
    title: 'Kiểm tra 15 phút - Hệ quản trị Cơ sở dữ liệu',
    courseCode: 'IT205',
    courseName: 'Cơ sở dữ liệu',
    durationMinutes: 15,
    startTime: '09:00 11/03/2026',
    endTime: '09:30 11/03/2026',
    status: 'completed',
    submissionCount: 85,
    isOpenForSubmissions: false,
    shuffleQuestions: true,
    instantScore: false,
    submissions: [],
  },
  {
    id: 'session-4',
    code: 'NET-FINAL-TEST',
    title: 'Thi thử kết thúc học phần - Mạng máy tính',
    courseCode: 'NET101',
    courseName: 'Mạng máy tính',
    durationMinutes: 45,
    startTime: '08:00 13/03/2026',
    endTime: '11:00 13/03/2026',
    status: 'upcoming',
    submissionCount: 0,
    isOpenForSubmissions: false,
    shuffleQuestions: true,
    instantScore: true,
    submissions: [],
  },
];

interface ExamSessionsPageProps {
  courses: Course[];
  onShowToast: (msg: string) => void;
}

export const ExamSessionsPage: React.FC<ExamSessionsPageProps> = ({
  courses,
  onShowToast,
}) => {
  const [sessions, setSessions] = useState<ExamSession[]>(INITIAL_SESSIONS);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'upcoming' | 'completed'>('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Selected session for viewing submissions
  const [activeSubmissionsSession, setActiveSubmissionsSession] = useState<ExamSession | null>(null);
  const [submissionSearch, setSubmissionSearch] = useState('');

  // QR Modal
  const [qrModalSession, setQrModalSession] = useState<ExamSession | null>(null);

  // Create Session Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCourseCode, setNewCourseCode] = useState('CS201');
  const [newDuration, setNewDuration] = useState(45);
  const [newShuffle, setNewShuffle] = useState(true);
  const [newInstantScore, setNewInstantScore] = useState(true);

  const getJoinUrl = (code: string) => `${window.location.origin}/join/${code}`;

  const handleCopy = (code: string) => {
    const url = getJoinUrl(code);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
    setCopiedCode(code);
    onShowToast(`Đã sao chép link ca thi: ${url}`);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleToggleOpen = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === sessionId) {
          const newState = !s.isOpenForSubmissions;
          onShowToast(newState ? `Đã mở nhận bài cho ca thi ${s.code}` : `Đã khóa nhận bài ca thi ${s.code}`);
          return { ...s, isOpenForSubmissions: newState };
        }
        return s;
      })
    );
  };

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      onShowToast('Vui lòng nhập tên ca thi');
      return;
    }

    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const code = `EXAM-${randomNum}`;
    const courseObj = courses.find((c) => c.code === newCourseCode) || {
      name: 'Môn học mới',
      code: newCourseCode,
    };

    const newSession: ExamSession = {
      id: `session-${Date.now()}`,
      code,
      title: newTitle.trim(),
      courseCode: newCourseCode,
      courseName: courseObj.name,
      durationMinutes: newDuration,
      startTime: 'Hôm nay',
      endTime: '23:59 hôm nay',
      status: 'active',
      submissionCount: 0,
      isOpenForSubmissions: true,
      shuffleQuestions: newShuffle,
      instantScore: newInstantScore,
      submissions: [],
    };

    setSessions([newSession, ...sessions]);
    setIsCreateModalOpen(false);
    setNewTitle('');
    onShowToast(`Đã tạo thành công ca thi mới: ${code}`);
  };

  const filteredSessions = sessions.filter((s) => {
    const matchSearch =
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.courseCode.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif] tracking-tight">
            Ca thi / Đợt kiểm tra trực tuyến
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Tổ chức ca thi độc lập qua Link & Mã ca thi. Thí sinh chỉ cần truy cập link và điền Họ tên + MSSV để nộp bài.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white shadow-xs hover:opacity-95 transition-all cursor-pointer shrink-0"
          style={{ backgroundColor: 'var(--primary)' }}
        >
          <Plus className="w-4 h-4" />
          <span>Tạo ca thi mới</span>
        </button>
      </div>

      {/* Notice Banner */}
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3.5 flex items-start gap-3">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
        <div className="text-xs text-emerald-900 leading-relaxed">
          <strong className="font-semibold">Mô hình ca thi không phân lớp:</strong> Mỗi ca thi có một mã định danh duy nhất (VD: <code className="bg-white/80 px-1.5 py-0.5 rounded border border-emerald-300 font-mono text-emerald-800">AI-MIDTERM-01</code>) và đường link công khai. Giảng viên chỉ cần gửi link cho thí sinh; kết quả nộp bài sẽ tự động tổng hợp danh sách Họ tên và MSSV.
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên bài, mã ca thi..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[var(--primary)] transition-all"
          />
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-100 p-1 rounded-md text-xs font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'hover:text-slate-900'
            }`}
          >
            Tất cả ({sessions.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1 rounded transition-colors cursor-pointer ${
              statusFilter === 'active'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'hover:text-slate-900'
            }`}
          >
            Đang diễn ra ({sessions.filter((s) => s.status === 'active').length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('upcoming')}
            className={`px-3 py-1 rounded transition-colors cursor-pointer ${
              statusFilter === 'upcoming'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'hover:text-slate-900'
            }`}
          >
            Sắp mở ({sessions.filter((s) => s.status === 'upcoming').length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('completed')}
            className={`px-3 py-1 rounded transition-colors cursor-pointer ${
              statusFilter === 'completed'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'hover:text-slate-900'
            }`}
          >
            Đã đóng ({sessions.filter((s) => s.status === 'completed').length})
          </button>
        </div>
      </div>

      {/* Sessions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredSessions.map((session) => (
          <div
            key={session.id}
            className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between gap-3"
          >
            <div>
              {/* Header: Title & Status */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200 tracking-wider">
                      {session.code}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      Học phần: {session.courseCode}
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-900 text-sm leading-snug">
                    {session.title}
                  </h3>
                </div>

                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold shrink-0 border ${
                    session.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : session.status === 'upcoming'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {session.status === 'active'
                    ? 'Đang diễn ra'
                    : session.status === 'upcoming'
                    ? 'Sắp mở'
                    : 'Đã hoàn thành'}
                </span>
              </div>

              {/* Join Link Bar */}
              <div className="mt-3 p-2 bg-slate-50 rounded-md border border-slate-200 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 truncate text-slate-600 font-mono text-[11px]">
                  <Share2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">/join/{session.code}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy(session.code)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Sao chép link gửi cho thí sinh"
                  >
                    {copiedCode === session.code ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="text-emerald-700 font-semibold">Đã chép</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Chép link</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setQrModalSession(session)}
                    className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-white border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
                    title="Hiển thị mã QR chiếu lên máy chiếu"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Meta stats */}
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Thời lượng: <strong>{session.durationMinutes} phút</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Đã nộp:{' '}
                    <strong className="text-emerald-700 font-semibold">
                      {session.submissionCount} lượt
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => handleToggleOpen(session.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-medium cursor-pointer transition-colors ${
                  session.isOpenForSubmissions
                    ? 'text-emerald-700 hover:bg-emerald-50'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
                title={session.isOpenForSubmissions ? 'Đang mở nhận bài' : 'Đang khóa nộp bài'}
              >
                {session.isOpenForSubmissions ? (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Đang nhận bài</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Đã khóa</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveSubmissionsSession(session)}
                className="inline-flex items-center gap-1 text-xs font-semibold hover:underline cursor-pointer"
                style={{ color: 'var(--primary)' }}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Xem bài nộp ({session.submissionCount})</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredSessions.length === 0 && (
        <div className="text-center py-12 bg-white border border-slate-200 rounded-lg p-6">
          <CalendarClock className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-800">Không tìm thấy ca thi nào</p>
          <p className="text-xs text-slate-500 mt-1">Thử đổi từ khóa tìm kiếm hoặc tạo ca thi mới.</p>
        </div>
      )}

      {/* MODAL: SUBMISSIONS LIST (Xem danh sách thí sinh nộp bài) */}
      {activeSubmissionsSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-800">
                    {activeSubmissionsSession.code}
                  </span>
                  <span className="text-xs text-slate-500">
                    {activeSubmissionsSession.courseCode}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  Danh sách bài nộp: {activeSubmissionsSession.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubmissionsSession(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-xs text-slate-500">Tổng lượt nộp</span>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">
                    {activeSubmissionsSession.submissionCount}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-xs text-slate-500">Điểm trung bình</span>
                  <div className="text-lg font-bold text-emerald-700 mt-0.5">
                    8.2 / 10
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-xs text-slate-500">Tỷ lệ đạt (&ge; 5.0)</span>
                  <div className="text-lg font-bold text-blue-700 mt-0.5">
                    94.8%
                  </div>
                </div>
              </div>

              {/* Search & Export */}
              <div className="flex items-center justify-between gap-3">
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={submissionSearch}
                    onChange={(e) => setSubmissionSearch(e.target.value)}
                    placeholder="Tìm theo Họ tên hoặc MSSV..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onShowToast(`Đã xuất kết quả ca thi ${activeSubmissionsSession.code} ra tệp Excel (.xlsx)`)
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Xuất bảng điểm (Excel)</span>
                </button>
              </div>

              {/* Submissions Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-3">Họ và tên thí sinh</th>
                      <th className="py-2.5 px-3">MSSV</th>
                      <th className="py-2.5 px-3">Thời gian nộp</th>
                      <th className="py-2.5 px-3">Thời lượng làm</th>
                      <th className="py-2.5 px-3 text-right">Điểm số</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeSubmissionsSession.submissions.length > 0 ? (
                      activeSubmissionsSession.submissions
                        .filter(
                          (sub) =>
                            sub.fullName.toLowerCase().includes(submissionSearch.toLowerCase()) ||
                            sub.studentId.toLowerCase().includes(submissionSearch.toLowerCase())
                        )
                        .map((sub) => (
                          <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                              {sub.fullName}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-700">
                              {sub.studentId}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">{sub.submittedAt}</td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {sub.durationSpentMinutes} phút
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                              {sub.score} / {sub.maxScore}
                            </td>
                          </tr>
                        ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">
                          Chưa có thí sinh nào nộp bài cho ca thi này.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-slate-200 flex justify-end bg-slate-50">
              <button
                type="button"
                onClick={() => setActiveSubmissionsSession(null)}
                className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: QR CODE ACCESS */}
      {qrModalSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Quét mã tham gia ca thi</h3>
              <button
                type="button"
                onClick={() => setQrModalSession(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* QR Visual */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 inline-block">
              <div className="w-48 h-48 bg-white border border-slate-300 rounded-lg p-2 flex flex-col items-center justify-center relative">
                {/* SVG QR Code Pattern */}
                <svg viewBox="0 0 100 100" className="w-full h-full text-slate-900 fill-current">
                  <rect x="0" y="0" width="30" height="30" rx="3" />
                  <rect x="5" y="5" width="20" height="20" fill="white" />
                  <rect x="10" y="10" width="10" height="10" />

                  <rect x="70" y="0" width="30" height="30" rx="3" />
                  <rect x="75" y="5" width="20" height="20" fill="white" />
                  <rect x="80" y="10" width="10" height="10" />

                  <rect x="0" y="70" width="30" height="30" rx="3" />
                  <rect x="5" y="75" width="20" height="20" fill="white" />
                  <rect x="10" y="80" width="10" height="10" />

                  <rect x="40" y="10" width="10" height="10" />
                  <rect x="55" y="20" width="10" height="10" />
                  <rect x="40" y="40" width="20" height="20" rx="2" />
                  <rect x="70" y="45" width="15" height="10" />
                  <rect x="45" y="70" width="10" height="20" />
                  <rect x="70" y="75" width="20" height="15" />
                </svg>
              </div>
            </div>

            {/* Code */}
            <div>
              <div className="text-xs text-slate-500 mb-1">Mã ca thi</div>
              <div className="font-mono text-xl font-bold text-slate-900 tracking-wider">
                {qrModalSession.code}
              </div>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                Thí sinh quét mã hoặc vào link, điền <strong>Họ tên</strong> và <strong>MSSV</strong> để làm bài.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleCopy(qrModalSession.code)}
              className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-white cursor-pointer hover:opacity-95"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              Sao chép đường link tham gia
            </button>
          </div>
        </div>
      )}

      {/* MODAL: CREATE SESSION */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-5 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-base">Tạo ca thi độc lập mới</h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSession} className="space-y-3.5 mt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên ca thi / Bài kiểm tra <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="VD: Kiểm tra 15 phút - Chương 3..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-[var(--primary)]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Học phần áp dụng
                  </label>
                  <select
                    value={newCourseCode}
                    onChange={(e) => setNewCourseCode(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-[var(--primary)]"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Thời lượng làm bài
                  </label>
                  <select
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-[var(--primary)]"
                  >
                    <option value={15}>15 phút</option>
                    <option value={30}>30 phút</option>
                    <option value={45}>45 phút</option>
                    <option value={60}>60 phút</option>
                    <option value={90}>90 phút</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="text-xs font-semibold text-slate-800">
                  Cơ chế tham gia:
                </div>
                <p className="text-[11px] text-slate-500">
                  Thí sinh không cần tài khoản lớp, chỉ cần nhập Link hoặc quét mã QR ca thi và điền <strong>Họ tên + MSSV</strong> khi bắt đầu.
                </p>
                <div className="pt-2 border-t border-slate-200 space-y-1.5 text-xs text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newShuffle}
                      onChange={(e) => setNewShuffle(e.target.checked)}
                      className="rounded text-[var(--primary)] focus:ring-0 cursor-pointer"
                    />
                    <span>Xáo trộn thứ tự câu hỏi và phương án trả lời</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newInstantScore}
                      onChange={(e) => setNewInstantScore(e.target.checked)}
                      className="rounded text-[var(--primary)] focus:ring-0 cursor-pointer"
                    />
                    <span>Hiển thị điểm số ngay khi thí sinh nộp bài</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white shadow-xs cursor-pointer hover:opacity-95"
                  style={{ backgroundColor: 'var(--primary)' }}
                >
                  Khởi tạo & Lấy link ca thi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
