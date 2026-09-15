import React, { useEffect, useState } from 'react';
import { Sparkles, Brain, CheckCircle2, Layers, RefreshCw } from 'lucide-react';
import {
  SourceDocument,
  AIGeneratorConfig,
  QuestionItem,
  Course,
  CourseChapter,
  CourseCLO,
} from '../../../types';
import { BLOOM_3_CONFIG } from '../../../data/mockAcademicData';

interface QuestionGenerationStepProps {
  config: AIGeneratorConfig;
  documents: SourceDocument[];
  courses: Course[];
  chapters: CourseChapter[];
  clos: CourseCLO[];
  onComplete: (generatedQuestions: QuestionItem[]) => void;
}

export const QuestionGenerationStep: React.FC<QuestionGenerationStepProps> = ({
  config,
  documents,
  courses,
  chapters,
  clos,
  onComplete,
}) => {
  const [progressPercent, setProgressPercent] = useState(15);
  const [statusText, setStatusText] = useState('Đang đọc ngữ liệu từ tài liệu nguồn đã tải lên...');

  useEffect(() => {
    const course = courses.find((c) => c.id === config.courseId);
    const courseChapters = chapters.filter((c) => c.courseId === config.courseId);
    const topic = courseChapters.flatMap((c) => c.topics).find((t) => t.id === config.topicId);
    const clo = clos.find((c) => c.id === config.cloId);
    const activeChap = courseChapters.find((c) =>
      c.topics.some((t) => t.id === config.topicId)
    );

    const primaryDoc = documents[0];
    const docTitle = primaryDoc ? primaryDoc.name : 'Tài liệu học phần';

    // Step 1: Reading
    const t1 = setTimeout(() => {
      setProgressPercent(40);
      setStatusText(`Đang đối chiếu nội dung "${docTitle}" với chuẩn đầu ra ${clo?.code || 'CLO'}...`);
    }, 600);

    // Step 2: Formulating Questions
    const t2 = setTimeout(() => {
      setProgressPercent(75);
      setStatusText(
        `Đang biên soạn câu hỏi mức độ "${BLOOM_3_CONFIG[config.bloom].label}" và tạo phương án nhiễu...`
      );
    }, 1300);

    // Step 3: Complete
    const t3 = setTimeout(() => {
      setProgressPercent(100);
      setStatusText('Hoàn thành sinh câu hỏi! Đang chuẩn bị giao diện kiểm duyệt...');

      // Synthesize realistic questions based on real extracted documents and topic
      const count = config.questionCount || 3;
      const questions: QuestionItem[] = [];

      const topicName = topic?.name || 'Nội dung trọng tâm';
      const cloCode = clo?.code || 'CLO-1';

      // Template set with rich academic variation
      const templates = [
        {
          content: `Căn cứ vào tài liệu nguồn "${docTitle}" trong chuyên đề "${topicName}", phát biểu nào sau đây phản ánh chính xác nhất về bản chất và nguyên lý vận hành?`,
          options: [
            'A. Tối ưu hóa không gian lưu trữ và đảm bảo tính toàn vẹn trạng thái thông qua cơ chế con trỏ liên kết',
            'B. Bắt buộc phải khóa toàn bộ bảng dữ liệu mỗi khi có thao tác đọc thông thường',
            'C. Luôn yêu cầu bộ nhớ liền kề cố định ngay tại thời điểm khai báo ban đầu',
            'D. Không hỗ trợ truy xuất tuần tự khi tập kích thước vượt quá giới hạn phân vùng',
          ],
          correctIndex: 0,
          explanation: `Đáp án A đúng. Tài liệu "${docTitle}" chỉ ra rằng cơ chế liên kết động tối ưu hóa tài nguyên và đảm bảo tính nhất quán của dữ liệu.`,
        },
        {
          content: `Theo chuẩn đầu ra ${cloCode}, khi triển khai giải pháp kỹ thuật cho "${topicName}", tiêu chí nào giữ vai trò quyết định hiệu năng xử lý hệ thống?`,
          options: [
            'A. Chi phí độ phức tạp thuật toán thời gian chạy và tần suất truy vấn dữ liệu tại giờ cao điểm',
            'B. Số lượng dòng comment chú thích trong từng khối lệnh con',
            'C. Cách đặt tên viết hoa hay viết thường của các tham số hình thức',
            'D. Tỷ lệ phần trăm diện tích màn hình hiển thị kết quả đầu ra',
          ],
          correctIndex: 0,
          explanation: `Đáp án A đúng. Độ phức tạp tính toán và chi phí I/O là 2 thông số cốt lõi đáp ứng chuẩn ${cloCode}.`,
        },
        {
          content: `Trong tình huống tài liệu đề cập đến xử lý tải cao đối với "${topicName}", phương án can thiệp nào sau đây giúp kiểm soát lỗi và ngăn ngừa tràn bộ nhớ?`,
          options: [
            'A. Thiết lập cơ chế kiểm soát biên, giải phóng kịp thời các tài nguyên không còn tham chiếu',
            'B. Bỏ qua toàn bộ khối kiểm tra ngoại lệ để giảm thời gian thực thi lệnh',
            'C. Khởi tạo mảng có kích thước cực đại ngay cả khi chưa có yêu cầu dữ liệu',
            'D. Cho phép ghi đè tự do lên các ô nhớ lân cận mà không cần đồng bộ khóa',
          ],
          correctIndex: 0,
          explanation: `Đáp án A đúng. Nguyên tắc thu hồi tài nguyên và kiểm tra biên bảo đảm độ an toàn bộ nhớ theo khuyến nghị của tài liệu.`,
        },
        {
          content: `Xét mối tương quan giữa ${cloCode} và các yêu cầu thực tế của "${topicName}", ưu điểm vượt trội của phương pháp được đề xuất trong tài liệu là gì?`,
          options: [
            'A. Khả năng mở rộng linh hoạt theo chiều ngang và giảm thiểu độ trễ phản hồi',
            'B. Loại bỏ hoàn toàn sự cần thiết của việc sao lưu dữ liệu dự phòng',
            'C. Đơn giản hóa mã nguồn đến mức không cần tài liệu đặc tả kỹ thuật',
            'D. Hoạt động độc lập không phụ thuộc vào nền tảng phần cứng cơ sở',
          ],
          correctIndex: 0,
          explanation: `Đáp án A đúng. Khả năng co giãn và duy trì độ trễ thấp là ưu thế nổi bật được nhấn mạnh trong tài liệu tham khảo.`,
        },
        {
          content: `Khi đánh giá sai số và trường hợp ngoại lệ trong triển khai "${topicName}", kết luận nào dưới đây là phù hợp nhất?`,
          options: [
            'A. Cần xây dựng kịch bản kiểm thử bao phủ toàn diện các giá trị biên và điều kiện tới hạn',
            'B. Chỉ kiểm thử với các bộ dữ liệu mẫu có kích thước nhỏ dưới 10 phần tử',
            'C. Bỏ qua các kiểm tra ràng buộc toàn vẹn dữ liệu khi hệ thống đang vận hành ổn định',
            'D. Mặc định rằng môi trường thực thi luôn cung cấp đủ tài nguyên lý tưởng',
          ],
          correctIndex: 0,
          explanation: `Đáp án A đúng. Kiểm thử biên và trường hợp cực hạn là yêu cầu bắt buộc để thỏa mãn ${cloCode}.`,
        },
      ];

      for (let i = 0; i < count; i++) {
        const tpl = templates[i % templates.length];
        const assignedDoc = documents[i % documents.length] || primaryDoc;

        questions.push({
          id: `ai-gen-${Date.now()}-${i + 1}`,
          courseId: config.courseId,
          chapterId: activeChap?.id || '',
          topicId: config.topicId,
          cloId: config.cloId,
          bloom: config.bloom,
          content: count > 5 ? `[Câu hỏi ${i + 1}] ${tpl.content}` : tpl.content,
          options: tpl.options,
          correctIndex: tpl.correctIndex,
          explanation: tpl.explanation,
          status: 'pending', // Default Pending
          source: 'ai',
          updatedAt: 'Vừa sinh xong',
          aiSuggestedMeta: {
            topicName,
            cloCode,
            bloom: config.bloom,
            sourceDocumentName: assignedDoc?.name,
          },
        });
      }

      setTimeout(() => {
        onComplete(questions);
      }, 500);
    }, 2200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [config, documents, courses, chapters, clos, onComplete]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 sm:p-12 text-center shadow-2xs space-y-6 max-w-xl mx-auto">
      {/* Animated AI Pulse */}
      <div className="relative mx-auto w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg"
        style={{ backgroundColor: 'var(--primary)' }}
      >
        <Sparkles className="w-8 h-8 animate-pulse" />
        <div
          className="absolute -inset-1.5 rounded-2xl opacity-30 animate-ping pointer-events-none"
          style={{ backgroundColor: 'var(--primary)' }}
        ></div>
      </div>

      <div className="space-y-2">
        <h3 className="text-base font-bold text-slate-900 font-['Plus_Jakarta_Sans',sans-serif]">
          AI đang phân tích tài liệu và sinh câu hỏi
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          {statusText}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div
            className="h-full transition-all duration-500 rounded-full"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: 'var(--primary)',
            }}
          ></div>
        </div>
        <div className="flex justify-between text-[11px] text-slate-400 font-medium px-1">
          <span>Tiến độ xử lý</span>
          <span className="font-bold text-slate-700">{progressPercent}%</span>
        </div>
      </div>

      {/* Extracted Document Reference Footer */}
      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-left text-xs text-slate-600 flex items-center gap-2.5">
        <Layers className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span className="truncate">
          Tài liệu nguồn đang nạp: <strong className="text-slate-800">{documents.map(d => d.name).join(', ')}</strong>
        </span>
      </div>
    </div>
  );
};
