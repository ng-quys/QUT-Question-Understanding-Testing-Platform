import React from 'react';
import { Database, FileSpreadsheet, CalendarClock, BarChart3 } from 'lucide-react';
import { SetupStep } from '../SetupStep';
import type{ DashboardNavTab } from '../../../types';

interface OnboardingDashboardProps {
  onNavigateTab: (tab: DashboardNavTab) => void;
  onOpenAIGenerator: () => void;
  onCreateExam: () => void;
  onCreateSession: () => void;
  onViewSampleReport?: () => void;
}

export const OnboardingDashboard: React.FC<OnboardingDashboardProps> = ({
  onNavigateTab,
  onOpenAIGenerator,
  onCreateExam,
  onCreateSession,
  onViewSampleReport,
}) => {
  return (
    <div className="space-y-6 pt-2">
      {/* Intro Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">
          Bắt đầu với ExamFlow
        </h2>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Hoàn thành các bước dưới đây để tạo và tổ chức kỳ thi đầu tiên. Bạn có thể xây dựng ngân hàng câu hỏi thủ công hoặc sử dụng AI để trích xuất nhanh từ giáo trình.
        </p>
      </div>

      {/* Vertical Workflow Stepper (1 -> 2 -> 3 -> 4) */}
      <div className="space-y-4">
        {/* Step 1: Ngân hàng câu hỏi */}
        <SetupStep
          stepNumber={1}
          title="Bước 1: Tạo ngân hàng câu hỏi"
          description="Thêm câu hỏi thủ công hoặc sử dụng AI để sinh câu hỏi từ nội dung bài học."
          badge="Khởi đầu"
          emptyTitle="Chưa có câu hỏi"
          emptySubtitle="Ngân hàng của bạn hiện đang trống"
          icon={Database}
          primaryAction={{
            label: 'Sinh câu hỏi bằng AI',
            onClick: onOpenAIGenerator,
            isAI: true,
          }}
          secondaryAction={{
            label: 'Thêm câu hỏi',
            onClick: () => onNavigateTab('question-bank'),
          }}
        />

        {/* Step 2: Tạo đề thi */}
        <SetupStep
          stepNumber={2}
          title="Bước 2: Tạo đề thi"
          description="Chọn câu hỏi từ ngân hàng và thiết lập cấu trúc cho đề thi (thời gian, ma trận, chuẩn đầu ra)."
          emptyTitle="Chưa có đề thi"
          emptySubtitle="Tạo đề thi mới để gắn kết câu hỏi và chỉ định ma trận"
          icon={FileSpreadsheet}
          primaryAction={{
            label: 'Tạo đề thi mới',
            onClick: onCreateExam,
          }}
        />

        {/* Step 3: Tổ chức ca thi */}
        <SetupStep
          stepNumber={3}
          title="Bước 3: Tổ chức ca thi"
          description="Lên lịch ngày giờ, thời lượng làm bài và phát hành link/mã truy cập cho thí sinh tham gia."
          emptyTitle="Chưa có ca thi nào được lên lịch"
          emptySubtitle="Lên lịch ca thi để cấp mã vào phòng và kích hoạt giám sát trực tuyến"
          icon={CalendarClock}
          primaryAction={{
            label: 'Lên lịch ca thi',
            onClick: onCreateSession,
          }}
        />

        {/* Step 4: Xem kết quả & Báo cáo chuẩn đầu ra */}
        <SetupStep
          stepNumber={4}
          isLast
          title="Bước 4: Xem kết quả & Báo cáo chuẩn đầu ra (CLO)"
          description="Hệ thống tự động chấm trắc nghiệm, thống kê phổ điểm và đo lường mức độ đạt chuẩn đầu ra."
          emptyTitle="Chưa có dữ liệu bài nộp"
          emptySubtitle="Báo cáo phân tích và ma trận phổ điểm sẽ xuất hiện sau khi sinh viên hoàn thành bài thi"
          icon={BarChart3}
          primaryAction={{
            label: 'Xem báo cáo mẫu',
            onClick: onViewSampleReport || (() => onNavigateTab('overview')),
          }}
        />
      </div>
    </div>
  );
};
