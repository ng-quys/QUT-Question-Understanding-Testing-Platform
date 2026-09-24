import type{ DashboardStat, ExamRecord } from '../types';

export interface ExamActivityItem {
  id: string;
  title: string;
  courseCode: string;
  examCode: string;
  submissionCount: number;
  timeLabel: string;
  status: 'active' | 'upcoming' | 'ending-soon' | 'completed';
  statusBadge: {
    label: string;
    className: string;
  };
  actionText: string;
}

export interface DashboardSummaryMetrics {
  completedExams: number;
  activeSessions: number;
}

export interface DashboardQuickStats {
  questions: number;
  exams: number;
  sessions: number;
  submissions: number;
}

export interface OnboardingStepData {
  id: number;
  stepNumber: number;
  title: string;
  description: string;
  badge?: string;
  emptyTitle: string;
  emptySubtitle: string;
  iconName: 'database' | 'file-spreadsheet' | 'calendar-clock' | 'bar-chart-3';
  primaryActionText: string;
  secondaryActionText?: string;
  primaryActionId: string;
  secondaryActionId?: string;
}

export const MOCK_EXAM_ACTIVITIES: ExamActivityItem[] = [
  {
    id: 'exam-1',
    title: 'Kiểm tra giữa kỳ - Cấu trúc dữ liệu',
    courseCode: 'CS201',
    examCode: 'AI-MIDTERM-01',
    submissionCount: 65,
    timeLabel: 'Đang diễn ra • Kết thúc sau 2 giờ',
    status: 'active',
    statusBadge: {
      label: 'Đang diễn ra',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    },
    actionText: 'Giám sát ca thi',
  },
  {
    id: 'exam-2',
    title: 'Trắc nghiệm tuần 6 - Lập trình Web',
    courseCode: 'INT310',
    examCode: 'WEB-QUIZ-02',
    submissionCount: 58,
    timeLabel: 'Hết hạn lúc 23:59 hôm nay',
    status: 'ending-soon',
    statusBadge: {
      label: 'Sắp đóng',
      className: 'bg-amber-50 text-amber-700 border-amber-200/80',
    },
    actionText: 'Gia hạn / Khóa',
  },
  {
    id: 'exam-3',
    title: 'Kiểm tra 15 phút - Cơ sở dữ liệu',
    courseCode: 'IT205',
    examCode: 'DB-QUIZ-15M',
    submissionCount: 85,
    timeLabel: 'Hoàn thành hôm qua • Điểm TB: 7.8',
    status: 'completed',
    statusBadge: {
      label: 'Đã hoàn thành',
      className: 'bg-slate-100 text-slate-700 border-slate-200',
    },
    actionText: 'Xem kết quả',
  },
  {
    id: 'exam-4',
    title: 'Thi thử kết thúc học phần - Mạng máy tính',
    courseCode: 'NET101',
    examCode: 'NET-FINAL-TEST',
    submissionCount: 0,
    timeLabel: 'Mở vào 08:00 sáng mai',
    status: 'upcoming',
    statusBadge: {
      label: 'Sắp diễn ra',
      className: 'bg-blue-50 text-blue-700 border-blue-200/80',
    },
    actionText: 'Xem đề thi',
  },
];

export const MOCK_SUMMARY_METRICS: DashboardSummaryMetrics = {
  completedExams: 128,
  activeSessions: 3,
};

export const MOCK_QUICK_STATS: DashboardQuickStats = {
  questions: 1248,
  exams: 32,
  sessions: 14,
  submissions: 1842,
};

export const MOCK_ONBOARDING_STEPS: OnboardingStepData[] = [
  {
    id: 1,
    stepNumber: 1,
    title: 'Bước 1: Tạo ngân hàng câu hỏi',
    description: 'Thêm câu hỏi thủ công hoặc sử dụng AI để sinh câu hỏi từ nội dung bài học.',
    badge: 'Khởi đầu',
    emptyTitle: 'Chưa có câu hỏi',
    emptySubtitle: 'Ngân hàng của bạn hiện đang trống',
    iconName: 'database',
    primaryActionText: 'Sinh câu hỏi bằng AI',
    primaryActionId: 'ai-generate',
    secondaryActionText: 'Thêm câu hỏi thủ công',
    secondaryActionId: 'manual-add',
  },
  {
    id: 2,
    stepNumber: 2,
    title: 'Bước 2: Tạo đề thi',
    description: 'Chọn câu hỏi từ ngân hàng và thiết lập cấu trúc cho đề thi (thời gian, ma trận, chuẩn đầu ra).',
    emptyTitle: 'Chưa có đề thi',
    emptySubtitle: 'Tạo đề thi mới để gắn kết câu hỏi và chỉ định ma trận',
    iconName: 'file-spreadsheet',
    primaryActionText: 'Tạo đề thi mới',
    primaryActionId: 'create-exam',
  },
  {
    id: 3,
    stepNumber: 3,
    title: 'Bước 3: Tổ chức ca thi',
    description: 'Lên lịch ngày giờ, thời lượng làm bài và phát hành link/mã truy cập cho thí sinh tham gia.',
    emptyTitle: 'Chưa có ca thi nào được lên lịch',
    emptySubtitle: 'Lên lịch ca thi để cấp mã vào phòng và kích hoạt giám sát trực tuyến',
    iconName: 'calendar-clock',
    primaryActionText: 'Lên lịch ca thi',
    primaryActionId: 'create-session',
  },
  {
    id: 4,
    stepNumber: 4,
    title: 'Bước 4: Xem kết quả & Báo cáo chuẩn đầu ra (CLO)',
    description: 'Hệ thống tự động chấm trắc nghiệm, thống kê phổ điểm và đo lường mức độ đạt chuẩn đầu ra.',
    emptyTitle: 'Chưa có dữ liệu bài nộp',
    emptySubtitle: 'Báo cáo phân tích và ma trận phổ điểm sẽ xuất hiện sau khi sinh viên hoàn thành bài thi',
    iconName: 'bar-chart-3',
    primaryActionText: 'Xem báo cáo mẫu',
    primaryActionId: 'view-sample-report',
  },
];
