import type{ ExamRecord, DashboardStat, ScoreDistributionItem, PerformancePoint } from '../types';

export const LECTURER_PROFILE = {
  name: 'Nguyễn Văn A',
  title: 'TS. Nguyễn Văn A',
  role: 'Giảng viên',
  department: 'Khoa Công nghệ Thông tin',
  university: 'Đại học Quốc gia',
  email: 'nguyenvana@university.edu.vn',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  currentSemester: 'Học kỳ 1 • 2026-2027',
};

export const DASHBOARD_STATS: DashboardStat[] = [
  {
    id: 'stat-questions',
    label: 'Câu hỏi',
    value: '1,248',
    changeText: '+8.2% tháng này',
    changeType: 'positive',
    iconName: 'database',
  },
  {
    id: 'stat-exams',
    label: 'Đề thi',
    value: '32',
    changeText: '+3 đề mới',
    changeType: 'positive',
    iconName: 'file-text',
  },
  {
    id: 'stat-sessions',
    label: 'Ca thi',
    value: '14',
    changeText: '2 ca sắp diễn ra',
    changeType: 'info',
    iconName: 'clock',
  },
  {
    id: 'stat-submissions',
    label: 'Lượt nộp bài',
    value: '1,842',
    changeText: '+124 lượt tuần này',
    changeType: 'positive',
    iconName: 'file-text',
  },
];

export const PERFORMANCE_DATA: PerformancePoint[] = [
  { month: 'T1', avgScore: 7.1, passRate: 82, totalExams: 4 },
  { month: 'T2', avgScore: 7.3, passRate: 85, totalExams: 6 },
  { month: 'T3', avgScore: 7.2, passRate: 84, totalExams: 5 },
  { month: 'T4', avgScore: 7.6, passRate: 88, totalExams: 8 },
  { month: 'T5', avgScore: 7.5, passRate: 86, totalExams: 7 },
  { month: 'T6', avgScore: 7.8, passRate: 91, totalExams: 9 },
];

export const SCORE_DISTRIBUTION: ScoreDistributionItem[] = [
  { range: '< 5', count: 18, percentage: 4.7, color: '#f43f5e' },
  { range: '5–6', count: 42, percentage: 10.9, color: '#fb923c' },
  { range: '6–7', count: 86, percentage: 22.3, color: '#facc15' },
  { range: '7–8', count: 134, percentage: 34.7, color: '#6366f1' },
  { range: '8–9', count: 82, percentage: 21.2, color: '#8b5cf6' },
  { range: '9–10', count: 24, percentage: 6.2, color: '#10b981' },
];

export const QUESTION_DIFFICULTY = [
  { label: 'Dễ', percentage: 38, count: 474, color: '#10b981', bgClass: 'bg-emerald-500', textClass: 'text-emerald-700', badgeBg: 'bg-emerald-50 border-emerald-200' },
  { label: 'Trung bình', percentage: 44, count: 549, color: '#6366f1', bgClass: 'bg-indigo-500', textClass: 'text-indigo-700', badgeBg: 'bg-indigo-50 border-indigo-200' },
  { label: 'Khó', percentage: 18, count: 225, color: '#f59e0b', bgClass: 'bg-amber-500', textClass: 'text-amber-700', badgeBg: 'bg-amber-50 border-amber-200' },
];

export const QUESTION_QUALITY = {
  good: { percentage: 68, label: 'Tốt', count: 848, desc: 'Độ phân biệt cao (DI > 0.35)' },
  review: { percentage: 22, label: 'Cần xem xét', count: 275, desc: 'Độ khó lệch hoặc phân vân' },
  edit: { percentage: 10, label: 'Nên chỉnh sửa', count: 125, desc: 'Tỷ lệ trả lời bất thường' },
};

export const RECENT_EXAMS_DATA: ExamRecord[] = [
  {
    id: 'EXAM-01',
    title: 'Lập trình Java — Giữa kỳ',
    subject: 'Lập trình Java',
    studentCount: 48,
    avgScore: 7.8,
    status: 'completed',
    examDate: '15/08/2026',
    durationMinutes: 60,
    questionCount: 40,
    roomCode: 'JAVA-MID-01',
  },
  {
    id: 'EXAM-02',
    title: 'Cơ sở dữ liệu — Cuối kỳ',
    subject: 'Cơ sở dữ liệu',
    studentCount: 62,
    avgScore: null,
    status: 'upcoming',
    examDate: '22/08/2026',
    durationMinutes: 90,
    questionCount: 50,
    roomCode: 'DB-FINAL-02',
  },
  {
    id: 'EXAM-03',
    title: 'Mạng máy tính — Quiz 3',
    subject: 'Mạng máy tính',
    studentCount: 41,
    avgScore: 8.1,
    status: 'completed',
    examDate: '12/08/2026',
    durationMinutes: 30,
    questionCount: 25,
    roomCode: 'NET-Q3-03',
  },
  {
    id: 'EXAM-04',
    title: 'Trí tuệ nhân tạo cơ bản — Quiz 2',
    subject: 'Trí tuệ nhân tạo',
    studentCount: 38,
    avgScore: null,
    status: 'ongoing',
    examDate: '19/08/2026',
    durationMinutes: 45,
    questionCount: 30,
    roomCode: 'AI-QUIZ2-04',
  },
  {
    id: 'EXAM-05',
    title: 'Cấu trúc dữ liệu & Giải thuật — Giữa kỳ',
    subject: 'CTDL & Giải thuật',
    studentCount: 55,
    avgScore: 7.5,
    status: 'completed',
    examDate: '08/08/2026',
    durationMinutes: 60,
    questionCount: 40,
    roomCode: 'DSA-MID-05',
  },
  {
    id: 'EXAM-06',
    title: 'Kỹ thuật Lập trình Web — Bài kiểm tra 2',
    subject: 'Phát triển Web',
    studentCount: 50,
    avgScore: 8.4,
    status: 'completed',
    examDate: '04/08/2026',
    durationMinutes: 45,
    questionCount: 35,
    roomCode: 'WEB-TEST-06',
  },
];

export const NOTIFICATIONS_DATA = [
  {
    id: 'notif-1',
    title: 'AI đã hoàn thành sinh 15 câu hỏi',
    time: '5 phút trước',
    type: 'ai',
    read: false,
    desc: 'Chủ đề: Hibernate ORM & Spring Boot JPA',
  },
  {
    id: 'notif-2',
    title: 'Ca thi đang diễn ra: Trí tuệ nhân tạo cơ bản',
    time: '25 phút trước',
    type: 'exam',
    read: false,
    desc: '38/38 sinh viên đã nộp bài hoặc đang làm',
  },
  {
    id: 'notif-3',
    title: 'Nhắc nhở: Ca thi Cơ sở dữ liệu sắp diễn ra',
    time: '2 giờ trước',
    type: 'reminder',
    read: true,
    desc: 'Thời gian: 08:00 ngày 22/08/2026 (Phòng máy A3.04)',
  },
];
