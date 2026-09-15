import {
  QuestionItem,
  Course,
  CourseChapter,
  CourseCLO,
  Bloom3Level,
} from '../../../types';
import { MatrixKnowledgeUnit } from '../matrix/types';

export function generateQuestionsFromMatrix(
  courseId: string,
  units: MatrixKnowledgeUnit[],
  chapters: CourseChapter[],
  clos: CourseCLO[],
  aiInstruction?: string,
  defaultScore: number = 0.5
): QuestionItem[] {
  const generated: QuestionItem[] = [];

  units.forEach((unit, uIdx) => {
    const chapter = chapters.find((c) => c.id === unit.chapterId);
    const clo = clos.find((c) => c.id === unit.cloId);
    const cloCode = clo?.code || 'CLO-1';
    const unitName = unit.name;

    // Helper to generate a question for a specific Bloom level
    const createQuestion = (bloom: Bloom3Level, indexInLevel: number): QuestionItem => {
      let content = '';
      let options: string[] = [];
      let correctIndex = 0;
      let explanation = '';

      if (bloom === 'remember') {
        const rememberTemplates = [
          {
            content: `Theo chuẩn đầu ra ${cloCode}, phát biểu nào sau đây nêu ĐÚNG định nghĩa và bản chất của "${unitName}"?`,
            options: [
              `A. Là cấu trúc kỹ thuật tổ chức và kiểm soát dữ liệu/logic theo nguyên lý được quy định tại ${cloCode}`,
              'B. Là giao thức kết nối bắt buộc phải dùng phần cứng chuyên dụng không đồng bộ',
              'C. Là thuật toán chỉ hoạt động khi toàn bộ tài nguyên hệ thống ở trạng thái ngoại tuyến',
              'D. Là cơ chế tĩnh không thể mở rộng hay tương thích với các nền tảng khác',
            ],
            correct: 0,
            expl: `Đáp án A chính xác theo định nghĩa chuẩn đầu ra ${cloCode} trong chuyên đề "${unitName}".`,
          },
          {
            content: `Thành phần hoặc đặc trưng cơ bản nào KHÔNG THỂ THIẾU khi khởi tạo đối tượng trong "${unitName}"?`,
            options: [
              'A. Bộ định danh duy nhất và không gian lưu trữ trạng thái hợp lệ',
              'B. Mã kích hoạt bản quyền từ nhà cung cấp máy chủ bên thứ ba',
              'C. Toàn bộ danh sách các biến trung gian của phiên làm việc trước',
              'D. Cấu hình tắt toàn bộ các cổng mạng đầu vào',
            ],
            correct: 0,
            expl: `Đáp án A đúng. Mọi đối tượng thuộc chuyên đề "${unitName}" đều yêu cầu định danh và không gian trạng thái ban đầu.`,
          },
        ];
        const t = rememberTemplates[indexInLevel % rememberTemplates.length];
        content = t.content;
        options = t.options;
        correctIndex = t.correct;
        explanation = t.expl;
      } else if (bloom === 'understand') {
        const understandTemplates = [
          {
            content: `Khi so sánh "${unitName}" với các mô hình tương đương trong hệ thống, ưu điểm nổi bật nhất về mặt kiến trúc là gì?`,
            options: [
              'A. Phân tách rõ ràng giữa tầng logic nghiệp vụ và tầng lưu trữ, giúp mở rộng độc lập',
              'B. Loại bỏ hoàn toàn sự cần thiết của kiểm tra dữ liệu đầu vào',
              'C. Giảm dung lượng tập tin xuống bằng không khi chạy trên môi trường đám mây',
              'D. Tự động đồng bộ mà không tiêu hao băng thông đường truyền mạng',
            ],
            correct: 0,
            expl: `Đáp án A đúng. Tính phân tách kiến trúc của "${unitName}" bảo đảm khả năng mở rộng và bảo trì theo ${cloCode}.`,
          },
          {
            content: `Giải thích nào sau đây phản ánh chính xác nhất nguyên nhân xảy ra suy giảm hiệu năng trong quá trình vận hành "${unitName}"?`,
            options: [
              'A. Tần suất truy vấn đồng thời vượt quá ngưỡng hàng đợi xử lý tối ưu',
              'B. Sử dụng tên biến có số ký tự lẻ thay vì số ký tự chẵn',
              'C. Hệ điều hành tự động hoán vị thứ tự các hàm không đồng bộ',
              'D. Bộ thông dịch không thể đọc được các khối lệnh điều kiện',
            ],
            correct: 0,
            expl: `Đáp án A đúng. Tắc nghẽn hàng đợi truy vấn là nguyên nhân kỹ thuật hàng đầu ảnh hưởng tới "${unitName}".`,
          },
        ];
        const t = understandTemplates[indexInLevel % understandTemplates.length];
        content = t.content;
        options = t.options;
        correctIndex = t.correct;
        explanation = t.expl;
      } else {
        // apply
        const applyTemplates = [
          {
            content: `Trong tình huống thực tế cần nâng cấp hệ thống liên quan đến "${unitName}", phương án can thiệp nào sau đây đáp ứng tốt nhất yêu cầu của ${cloCode}?`,
            options: [
              'A. Áp dụng kỹ thuật phân vùng dữ liệu và bộ nhớ đệm (caching) để giảm tải tài nguyên',
              'B. Bỏ qua các ràng buộc bảo mật để tối đa hóa tốc độ phản hồi',
              'C. Nhân bản mã nguồn thành nhiều bản sao độc lập không đồng bộ',
              'D. Khóa tài khoản người dùng mỗi khi có cập nhật cơ sở dữ liệu',
            ],
            correct: 0,
            expl: `Đáp án A đúng. Phân vùng và caching là giải pháp thực tế giải quyết bài toán tải cho "${unitName}".`,
          },
          {
            content: `Kỹ sư phần mềm gặp lỗi sai số biên khi thực thi thuật toán trong "${unitName}". Bước xử lý tối ưu theo quy chuẩn là gì?`,
            options: [
              'A. Thiết lập kiểm thử đơn vị với các ca biên (edge cases) và bổ sung kiểm tra điều kiện tiên quyết',
              'B. Thay đổi kết quả đầu ra mong muốn để khớp với giá trị lỗi hiện tại',
              'C. Vô hiệu hóa toàn bộ thông báo lỗi trên giao diện người dùng',
              'D. Chuyển dịch toàn bộ cơ sở dữ liệu sang định dạng văn bản thuần túy',
            ],
            correct: 0,
            expl: `Đáp án A đúng. Thêm kiểm thử ca biên và điều kiện kiểm tra bảo đảm độ tin cậy theo ${cloCode}.`,
          },
        ];
        const t = applyTemplates[indexInLevel % applyTemplates.length];
        content = t.content;
        options = t.options;
        correctIndex = t.correct;
        explanation = t.expl;
      }

      if (aiInstruction && aiInstruction.trim()) {
        explanation += ` (Được tối ưu theo chỉ thị: "${aiInstruction.slice(0, 45)}...")`;
      }

      return {
        id: `ai-matrix-${Date.now()}-${uIdx}-${bloom}-${indexInLevel}-${Math.random().toString(36).substr(2, 4)}`,
        courseId,
        chapterId: unit.chapterId,
        topicId: unit.id,
        cloId: unit.cloId,
        bloom,
        content,
        options,
        correctIndex,
        explanation,
        status: 'pending',
        source: 'ai',
        updatedAt: 'Vừa sinh bằng AI',
        default_score: defaultScore,
        aiSuggestedMeta: {
          topicName: unit.name,
          cloCode,
          bloom,
          sourceDocumentName: 'Ma trận học phần chuẩn',
        },
      };
    };

    // 1. Nhận biết (nb)
    for (let i = 0; i < unit.nb; i++) {
      generated.push(createQuestion('remember', i));
    }

    // 2. Thông hiểu (th)
    for (let i = 0; i < unit.th; i++) {
      generated.push(createQuestion('understand', i));
    }

    // 3. Vận dụng (vd)
    for (let i = 0; i < unit.vd; i++) {
      generated.push(createQuestion('apply', i));
    }
  });

  return generated;
}
