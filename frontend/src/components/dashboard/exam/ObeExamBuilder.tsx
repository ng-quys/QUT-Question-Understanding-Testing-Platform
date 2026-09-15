import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Plus,
  RefreshCw,
  FileText,
  Download,
  Printer,
  Radio as RadioIcon,
  Copy,
  Check,
  Clock,
  Layers,
  ShieldCheck,
  Shuffle,
  BookOpen,
  X,
  Send,
  ExternalLink,
} from 'lucide-react';
import {
  Course,
  CourseChapter,
  CourseCLO,
  QuestionItem,
  Bloom3Level,
  ExamRecord,
} from '../../../types';
import { BLOOM_3_CONFIG } from '../../../data/mockAcademicData';

interface ObeExamBuilderProps {
  courses: Course[];
  chapters: CourseChapter[];
  clos: CourseCLO[];
  questions: QuestionItem[];
  onUpdateQuestions: React.Dispatch<React.SetStateAction<QuestionItem[]>>;
  onSaveExam: (newExam: ExamRecord) => void;
  onCancel: () => void;
  onShowToast: (msg: string) => void;
  onNavigateToOnlineSession: (examTitle: string, roomCode: string) => void;
}

// Knowledge unit row in the matrix
interface MatrixRowConfig {
  rowId: string;
  chapterId: string;
  chapterName: string;
  topicId: string;
  topicName: string;
  cloId: string;
  cloCode: string;
  cloDesc: string;
  // Requested quantities per Bloom level
  reqRemember: number;
  reqUnderstand: number;
  reqApply: number;
}

// Track picked question with point
interface PickedQuestion {
  question: QuestionItem;
  points: number;
  bloom: Bloom3Level;
  cloCode: string;
  rowId: string;
}

export const ObeExamBuilder: React.FC<ObeExamBuilderProps> = ({
  courses,
  chapters,
  clos,
  questions,
  onUpdateQuestions,
  onSaveExam,
  onCancel,
  onShowToast,
  onNavigateToOnlineSession,
}) => {
  // 4 Steps: 1 -> 2 -> 3 -> 4
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // STEP 1: GENERAL INFO
  const [examTitle, setExamTitle] = useState<string>(
    'Kiểm tra giữa kỳ - Học phần Trí tuệ nhân tạo'
  );
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    courses[0]?.id || 'course-ti01'
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(45);

  // SCORING STRATEGY
  // 'equal' = Chia đều toàn đề (Thang 10 / Tổng số câu)
  // 'bloomWeight' = Tính điểm theo trọng số từng mức độ Bloom (Tổng 10 điểm)
  const [scoringStrategy, setScoringStrategy] = useState<'equal' | 'bloomWeight'>('equal');
  const [bloomWeights, setBloomWeights] = useState<{
    remember: number;
    understand: number;
    apply: number;
  }>({
    remember: 3.0,
    understand: 4.0,
    apply: 3.0,
  });

  // Current selected course entity
  const currentCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];
  const courseChapters = useMemo(
    () => chapters.filter((ch) => ch.courseId === selectedCourseId),
    [chapters, selectedCourseId]
  );
  const courseClos = useMemo(
    () => clos.filter((cl) => cl.courseId === selectedCourseId),
    [clos, selectedCourseId]
  );

  // Initialize Matrix Rows based on Course Chapters & Topics
  const [matrixRows, setMatrixRows] = useState<MatrixRowConfig[]>(() => {
    // Generate initial realistic rows for first course
    return [
      {
        rowId: 'row-1',
        chapterId: 'chap-ti01-1',
        chapterName: 'Chương 1: Giới thiệu AI & Tác tử',
        topicId: 'top-ti01-1-1',
        topicName: '1.1 Định nghĩa AI & Phân loại Agent',
        cloId: 'clo-ti01-1',
        cloCode: 'CLO 1.1',
        cloDesc: 'Trình bày các khái niệm cơ bản về AI và Agent',
        reqRemember: 2,
        reqUnderstand: 2,
        reqApply: 0,
      },
      {
        rowId: 'row-2',
        chapterId: 'chap-ti01-1',
        chapterName: 'Chương 1: Giới thiệu AI & Tác tử',
        topicId: 'top-ti01-1-2',
        topicName: '1.2 Môi trường tác tử & Kiến trúc PEAS',
        cloId: 'clo-ti01-2',
        cloCode: 'CLO 1.2',
        cloDesc: 'Phân tích môi trường tác tử và kiến trúc thông minh',
        reqRemember: 2,
        reqUnderstand: 2,
        reqApply: 1,
      },
      {
        rowId: 'row-3',
        chapterId: 'chap-ti01-2',
        chapterName: 'Chương 2: Không gian trạng thái & Tìm kiếm',
        topicId: 'top-ti01-2-1',
        topicName: '2.1 Tìm kiếm mù BFS & DFS',
        cloId: 'clo-ti01-3',
        cloCode: 'CLO 2.1',
        cloDesc: 'Áp dụng thuật toán tìm kiếm giải quyết bài toán',
        reqRemember: 2,
        reqUnderstand: 2,
        reqApply: 1,
      },
      {
        rowId: 'row-4',
        chapterId: 'chap-ti01-2',
        chapterName: 'Chương 2: Không gian trạng thái & Tìm kiếm',
        topicId: 'top-ti01-2-2',
        topicName: '2.2 Heuristic & Tìm kiếm A*',
        cloId: 'clo-ti01-3',
        cloCode: 'CLO 2.1',
        cloDesc: 'Áp dụng thuật toán tìm kiếm tối ưu',
        reqRemember: 1,
        reqUnderstand: 2,
        reqApply: 2,
      },
      {
        rowId: 'row-5',
        chapterId: 'chap-ti01-3',
        chapterName: 'Chương 3: Biểu diễn tri thức & Logic',
        topicId: 'top-ti01-3-1',
        topicName: '3.1 Logic mệnh đề & Bảng chân trị',
        cloId: 'clo-ti01-4',
        cloCode: 'CLO 2.2',
        cloDesc: 'Vận dụng mô hình suy diễn logic',
        reqRemember: 1,
        reqUnderstand: 1,
        reqApply: 1,
      },
    ];
  });

  // When course changes, regenerate appropriate matrix rows
  const handleCourseChange = (courseId: string) => {
    setSelectedCourseId(courseId);
    const newCourse = courses.find((c) => c.id === courseId);
    if (newCourse) {
      setExamTitle(`Kiểm tra giữa kỳ - Học phần ${newCourse.name}`);
    }
    const newChaps = chapters.filter((ch) => ch.courseId === courseId);
    const newClos = clos.filter((cl) => cl.courseId === courseId);

    const generatedRows: MatrixRowConfig[] = [];
    newChaps.forEach((ch, cIndex) => {
      ch.topics.forEach((top, tIndex) => {
        const assignedClo = newClos[(cIndex + tIndex) % (newClos.length || 1)] || {
          id: 'clo-default',
          code: 'CLO 1.1',
          description: 'Chuẩn đầu ra học phần',
        };
        generatedRows.push({
          rowId: `row-${courseId}-${ch.id}-${top.id}`,
          chapterId: ch.id,
          chapterName: `${ch.code}: ${ch.name}`,
          topicId: top.id,
          topicName: top.name,
          cloId: assignedClo.id,
          cloCode: assignedClo.code,
          cloDesc: assignedClo.description,
          reqRemember: 2,
          reqUnderstand: 2,
          reqApply: 1,
        });
      });
    });

    if (generatedRows.length > 0) {
      setMatrixRows(generatedRows);
    }
  };

  // Matrix Totals Calculation
  const totalRemember = useMemo(
    () => matrixRows.reduce((sum, r) => sum + Number(r.reqRemember || 0), 0),
    [matrixRows]
  );
  const totalUnderstand = useMemo(
    () => matrixRows.reduce((sum, r) => sum + Number(r.reqUnderstand || 0), 0),
    [matrixRows]
  );
  const totalApply = useMemo(
    () => matrixRows.reduce((sum, r) => sum + Number(r.reqApply || 0), 0),
    [matrixRows]
  );
  const totalExamQuestions = totalRemember + totalUnderstand + totalApply;

  // Single question point calculated based on chosen strategy
  const getQuestionPoint = (bloom: Bloom3Level) => {
    if (totalExamQuestions <= 0) return 0;
    if (scoringStrategy === 'equal') {
      return Number((10 / totalExamQuestions).toFixed(2));
    }
    // bloomWeight
    if (bloom === 'remember') {
      return totalRemember > 0 ? Number((bloomWeights.remember / totalRemember).toFixed(2)) : 0;
    }
    if (bloom === 'understand') {
      return totalUnderstand > 0
        ? Number((bloomWeights.understand / totalUnderstand).toFixed(2))
        : 0;
    }
    return totalApply > 0 ? Number((bloomWeights.apply / totalApply).toFixed(2)) : 0;
  };

  // STEP 2: AVAILABILITY CHECK & EXTRACTION STATE
  // Quick manual add modal state
  const [manualModalCell, setManualModalCell] = useState<{
    row: MatrixRowConfig;
    bloom: Bloom3Level;
  } | null>(null);
  const [manualContent, setManualContent] = useState('');
  const [manualOptions, setManualOptions] = useState(['', '', '', '']);
  const [manualCorrectIndex, setManualCorrectIndex] = useState(0);

  // AI Generation loading indicator per row/bloom
  const [aiGeneratingCell, setAiGeneratingCell] = useState<string | null>(null);

  // Helper: Get available approved questions in bank for a specific row & bloom
  const getAvailableApprovedQuestions = (row: MatrixRowConfig, bloom: Bloom3Level) => {
    return questions.filter((q) => {
      // Must be approved
      if (q.status !== 'approved') return false;
      // Must match course
      if (q.courseId !== selectedCourseId) return false;
      // Must match Bloom level
      if (q.bloom !== bloom) return false;
      // Match CLO or Chapter
      const matchClo = q.cloId === row.cloId;
      const matchChapter = q.chapterId === row.chapterId;
      return matchClo || matchChapter;
    });
  };

  // Check availability status across all matrix cells
  const cellAvailabilityStatus = useMemo(() => {
    let allSufficient = true;
    let totalMissing = 0;

    const details = matrixRows.map((row) => {
      const availRem = getAvailableApprovedQuestions(row, 'remember').length;
      const availUnd = getAvailableApprovedQuestions(row, 'understand').length;
      const availApp = getAvailableApprovedQuestions(row, 'apply').length;

      const diffRem = row.reqRemember - availRem;
      const diffUnd = row.reqUnderstand - availUnd;
      const diffApp = row.reqApply - availApp;

      if (diffRem > 0) {
        allSufficient = false;
        totalMissing += diffRem;
      }
      if (diffUnd > 0) {
        allSufficient = false;
        totalMissing += diffUnd;
      }
      if (diffApp > 0) {
        allSufficient = false;
        totalMissing += diffApp;
      }

      return {
        rowId: row.rowId,
        remember: { req: row.reqRemember, avail: availRem, missing: Math.max(0, diffRem) },
        understand: { req: row.reqUnderstand, avail: availUnd, missing: Math.max(0, diffUnd) },
        apply: { req: row.reqApply, avail: availApp, missing: Math.max(0, diffApp) },
      };
    });

    return { allSufficient, totalMissing, details };
  }, [matrixRows, questions, selectedCourseId]);

  // Handle AI Auto-fulfill missing question for a cell
  const handleAISupplementCell = (row: MatrixRowConfig, bloom: Bloom3Level, countNeeded: number) => {
    const cellKey = `${row.rowId}-${bloom}`;
    setAiGeneratingCell(cellKey);

    setTimeout(() => {
      const bloomLabel = BLOOM_3_CONFIG[bloom].label;
      const newItems: QuestionItem[] = [];

      for (let i = 1; i <= countNeeded; i++) {
        const newId = `ai-gen-${Date.now()}-${i}`;
        newItems.push({
          id: newId,
          courseId: selectedCourseId,
          chapterId: row.chapterId,
          topicId: row.topicId,
          cloId: row.cloId,
          bloom,
          content: `[AI Đã chuẩn hóa] Câu hỏi về ${row.topicName} (Chuẩn ${row.cloCode} - Mức ${bloomLabel} số ${i}): Phân tích nguyên lý và ứng dụng thực tế trong hệ thống?`,
          options: [
            `Phương án tối ưu hóa theo mô hình ${row.cloCode}`,
            `Cơ chế phân loại và xử lý luồng sự kiện`,
            `Thuật toán heuristic bám sát điều kiện biên`,
            `Phương thức kiểm tra đánh giá độ tin cậy`,
          ],
          correctIndex: 0,
          explanation: `Giải thích chi tiết theo giáo trình học phần: Đáp án A bám sát chuẩn đầu ra ${row.cloCode} ở mức nhận thức ${bloomLabel}.`,
          status: 'approved', // Automatically approved
          source: 'ai',
          updatedAt: 'Vừa xong',
          default_score: getQuestionPoint(bloom),
        });
      }

      onUpdateQuestions((prev) => [...newItems, ...prev]);
      setAiGeneratingCell(null);
      onShowToast(`AI đã sinh bổ sung thành công ${countNeeded} câu hỏi [Đã duyệt] cho ${row.cloCode}!`);
    }, 900);
  };

  // Handle Manual Question Creation for a cell
  const handleSaveManualQuestion = () => {
    if (!manualModalCell || !manualContent.trim()) {
      onShowToast('Vui lòng nhập nội dung câu hỏi!');
      return;
    }

    const { row, bloom } = manualModalCell;
    const newQ: QuestionItem = {
      id: `manual-q-${Date.now()}`,
      courseId: selectedCourseId,
      chapterId: row.chapterId,
      topicId: row.topicId,
      cloId: row.cloId,
      bloom,
      content: manualContent.trim(),
      options: manualOptions.map((opt, i) =>
        opt.trim() ? opt.trim() : `Phương án ${String.fromCharCode(65 + i)}`
      ),
      correctIndex: manualCorrectIndex,
      explanation: `Giải thích theo chuẩn ${row.cloCode}`,
      status: 'approved',
      source: 'manual',
      updatedAt: 'Vừa xong',
      default_score: getQuestionPoint(bloom),
    };

    onUpdateQuestions((prev) => [newQ, ...prev]);
    setManualModalCell(null);
    setManualContent('');
    setManualOptions(['', '', '', '']);
    onShowToast(`Đã thêm câu hỏi thủ công [Đã duyệt] cho ô ${row.cloCode} thành công!`);
  };

  // STEP 3: PICKED QUESTIONS & SHUFFLING
  const [pickedQuestions, setPickedQuestions] = useState<PickedQuestion[]>([]);
  const [examCodeCount, setExamCodeCount] = useState<1 | 2 | 4>(4);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [previewCodeTab, setPreviewCodeTab] = useState<string>('101');

  // Trigger Automatic Extraction when moving from Step 1 -> Step 2 or inside Step 2
  const performAutoExtraction = () => {
    const selected: PickedQuestion[] = [];
    const usedIds = new Set<string>();

    matrixRows.forEach((row) => {
      // Remember
      const poolRem = getAvailableApprovedQuestions(row, 'remember');
      let pickedCountRem = 0;
      for (const q of poolRem) {
        if (!usedIds.has(q.id) && pickedCountRem < row.reqRemember) {
          usedIds.add(q.id);
          selected.push({
            question: q,
            points: getQuestionPoint('remember'),
            bloom: 'remember',
            cloCode: row.cloCode,
            rowId: row.rowId,
          });
          pickedCountRem++;
        }
      }

      // Understand
      const poolUnd = getAvailableApprovedQuestions(row, 'understand');
      let pickedCountUnd = 0;
      for (const q of poolUnd) {
        if (!usedIds.has(q.id) && pickedCountUnd < row.reqUnderstand) {
          usedIds.add(q.id);
          selected.push({
            question: q,
            points: getQuestionPoint('understand'),
            bloom: 'understand',
            cloCode: row.cloCode,
            rowId: row.rowId,
          });
          pickedCountUnd++;
        }
      }

      // Apply
      const poolApp = getAvailableApprovedQuestions(row, 'apply');
      let pickedCountApp = 0;
      for (const q of poolApp) {
        if (!usedIds.has(q.id) && pickedCountApp < row.reqApply) {
          usedIds.add(q.id);
          selected.push({
            question: q,
            points: getQuestionPoint('apply'),
            bloom: 'apply',
            cloCode: row.cloCode,
            rowId: row.rowId,
          });
          pickedCountApp++;
        }
      }
    });

    setPickedQuestions(selected);
  };

  // Replace individual question with equivalent in bank
  const handleReplaceEquivalentQuestion = (targetIndex: number) => {
    const target = pickedQuestions[targetIndex];
    if (!target) return;

    const alreadyPickedIds = new Set(pickedQuestions.map((p) => p.question.id));

    // Find candidate in approved questions with SAME clo and SAME bloom
    const candidates = questions.filter(
      (q) =>
        q.status === 'approved' &&
        q.courseId === selectedCourseId &&
        q.bloom === target.bloom &&
        q.cloId === target.question.cloId &&
        !alreadyPickedIds.has(q.id)
    );

    if (candidates.length > 0) {
      // Pick random candidate
      const replacement = candidates[Math.floor(Math.random() * candidates.length)];
      setPickedQuestions((prev) => {
        const clone = [...prev];
        clone[targetIndex] = {
          ...clone[targetIndex],
          question: replacement,
        };
        return clone;
      });
      onShowToast(`Đã đổi thành công sang câu hỏi tương đương cùng chuẩn ${target.cloCode}!`);
    } else {
      // If none available, generate equivalent question
      const newGen: QuestionItem = {
        id: `ai-replace-${Date.now()}`,
        courseId: selectedCourseId,
        chapterId: target.question.chapterId,
        topicId: target.question.topicId,
        cloId: target.question.cloId,
        bloom: target.bloom,
        content: `[Tương đương] Câu hỏi hoán đổi tương đương về nội dung ${target.cloCode}: Đánh giá trường hợp tối ưu và giải pháp tương thích?`,
        options: [
          `Phương án giải pháp tương thích theo chuẩn ${target.cloCode}`,
          `Tiêu chuẩn đánh giá thời gian phản hồi`,
          `Mô hình phân tán và khả năng chịu lỗi`,
          `Cấu hình tham số ngưỡng phát hiện bất thường`,
        ],
        correctIndex: 0,
        explanation: `Giải thích chi tiết: Câu hỏi tương đương cùng chuẩn ${target.cloCode}.`,
        status: 'approved',
        source: 'ai',
        updatedAt: 'Vừa xong',
      };
      onUpdateQuestions((prev) => [newGen, ...prev]);
      setPickedQuestions((prev) => {
        const clone = [...prev];
        clone[targetIndex] = {
          ...clone[targetIndex],
          question: newGen,
        };
        return clone;
      });
      onShowToast(`Đã tự động tạo và hoán đổi câu hỏi tương đương cùng chuẩn ${target.cloCode}!`);
    }
  };

  // STEP 4: PUBLISH & EXPORT MODALS
  const [onlineModalOpen, setOnlineModalOpen] = useState(false);
  const [generatedRoomCode, setGeneratedRoomCode] = useState(`OBE-${Math.floor(1000 + Math.random() * 9000)}`);
  const [onlineStartTime, setOnlineStartTime] = useState('08:00');
  const [onlineEndTime, setOnlineEndTime] = useState('09:30');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Handle Export Word
  const handleExportWord = () => {
    onShowToast(`Đang kết xuất đề thi định dạng Word chuẩn (.docx): ${examTitle}`);
    const examCodesList = examCodeCount === 4 ? ['101', '102', '103', '104'] : ['101', '102'];

    let content = `BỘ GIÁO DỤC VÀ ĐÀO TẠO\nTRƯỜNG ĐẠI HỌC CÔNG NGHỆ THÔNG TIN\n`;
    content += `KHOA CÔNG NGHỆ THÔNG TIN\n\n`;
    content += `ĐỀ THI KẾT THÚC HỌC PHẦN (CHUẨN MA TRẬN OBE)\n`;
    content += `Tên bài thi: ${examTitle}\n`;
    content += `Học phần: ${currentCourse.code} - ${currentCourse.name}\n`;
    content += `Thời gian làm bài: ${durationMinutes} phút (Không kể thời gian phát đề)\n`;
    content += `Mã đề thi: 101\n\n`;
    content += `Họ và tên thí sinh: ....................................................\n`;
    content += `Mã số sinh viên (MSSV): .................................................\n`;
    content += `Phòng thi số: .............. Chữ ký Giám thị: ............................\n\n`;
    content += `========================================================================\n`;
    content += `NỘI DUNG ĐỀ THI (${pickedQuestions.length} CÂU TRẮC NGHIỆM - THANG ĐIỂM 10.0)\n`;
    content += `========================================================================\n\n`;

    pickedQuestions.forEach((pq, idx) => {
      content += `Câu ${idx + 1} (${pq.points} điểm) [${pq.cloCode} - ${BLOOM_3_CONFIG[pq.bloom].label}]:\n`;
      content += `${pq.question.content}\n`;
      pq.question.options.forEach((opt, optIdx) => {
        content += `   ${String.fromCharCode(65 + optIdx)}. ${opt}\n`;
      });
      content += `\n`;
    });

    content += `\n========================================================================\n`;
    content += `BẢNG ĐÁP ÁN CHÍNH THỨC (ANSWER KEY) CHO CÁC MÃ ĐỀ: ${examCodesList.join(', ')}\n`;
    content += `========================================================================\n\n`;
    pickedQuestions.forEach((pq, idx) => {
      content += `Câu ${idx + 1}: ${String.fromCharCode(65 + pq.question.correctIndex)} | `;
      if ((idx + 1) % 5 === 0) content += `\n`;
    });

    const blob = new Blob([content], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `De_thi_OBE_${examTitle.replace(/\s+/g, '_')}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Handle Export PDF
  const handleExportPdf = () => {
    onShowToast(`Đang chuẩn bị bản in PDF chuẩn học kỳ cho: ${examTitle}`);
    window.print();
  };

  // Save Final Exam Record
  const handleFinishExamCreation = () => {
    const newRecord: ExamRecord = {
      id: `exam-${Date.now()}`,
      title: examTitle,
      subject: `${currentCourse.code} - ${currentCourse.name}`,
      studentCount: 0,
      avgScore: null,
      status: 'completed',
      examDate: new Date().toLocaleDateString('vi-VN'),
      durationMinutes,
      questionCount: pickedQuestions.length,
      roomCode: generatedRoomCode,
    };
    onSaveExam(newRecord);
    onShowToast(`Đã xuất bản đề thi "${examTitle}" thành công!`);
  };

  return (
    <div className="space-y-5 pb-12 animate-in fade-in duration-200">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/90 pb-4">
        <div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors mb-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại Quản lý đề thi</span>
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">
              Tạo đề thi chuẩn theo Ma trận OBE
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider">
              Quy trình 4 bước
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Quy trình chuẩn hóa rút trích câu hỏi bám sát chuẩn đầu ra (CLO), mức nhận thức Bloom và sinh mã đề hoán vị
          </p>
        </div>

        {/* Stepper Progress Indicator */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 p-1.5 rounded-xl self-start sm:self-auto shadow-2xs">
          {[
            { step: 1, label: '1. Ma trận OBE' },
            { step: 2, label: '2. Bốc câu hỏi' },
            { step: 3, label: '3. Hoán vị mã đề' },
            { step: 4, label: '4. Xuất bản' },
          ].map((s) => (
            <div
              key={s.step}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                currentStep === s.step
                  ? 'bg-white text-indigo-700 font-bold shadow-2xs border border-slate-200/80'
                  : currentStep > s.step
                  ? 'text-emerald-700'
                  : 'text-slate-400'
              }`}
            >
              {currentStep > s.step ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <span
                  className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${
                    currentStep === s.step
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {s.step}
                </span>
              )}
              <span className="hidden md:inline">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BƯỚC 1: THIẾT LẬP THÔNG TIN & MA TRẬN ĐỀ THI */}
      {/* ========================================================================= */}
      {currentStep === 1 && (
        <div className="space-y-5">
          {/* Card: Thông tin chung */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                1. Thông tin chung của đề thi
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Tên bài thi */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên bài thi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                  placeholder="VD: Kiểm tra giữa kỳ - Học phần Trí tuệ nhân tạo"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 font-medium text-slate-900"
                />
              </div>

              {/* Học phần mục tiêu */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Học phần mục tiêu <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => handleCourseChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 font-medium text-slate-900"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Thời gian làm bài */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Thời gian làm bài (phút) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 font-medium text-slate-900"
                  >
                    <option value={30}>30 phút</option>
                    <option value={45}>45 phút (Tiêu chuẩn)</option>
                    <option value={60}>60 phút</option>
                    <option value={90}>90 phút (Học kỳ)</option>
                    <option value={120}>120 phút</option>
                  </select>
                </div>
              </div>

              {/* Cơ chế tính điểm đề thi */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Cơ chế tính điểm đề thi (Thang 10 điểm)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                      scoringStrategy === 'equal'
                        ? 'bg-indigo-50/60 border-indigo-300 ring-1 ring-indigo-200'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
                    }`}
                  >
                    <input
                      type="radio"
                      name="scoringStrategy"
                      checked={scoringStrategy === 'equal'}
                      onChange={() => setScoringStrategy('equal')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        Chia đều toàn đề
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Thang 10 / Tổng số câu (Hiện tại:{' '}
                        <strong className="text-indigo-700">
                          {totalExamQuestions > 0
                            ? (10 / totalExamQuestions).toFixed(2)
                            : 0}{' '}
                          đ/câu
                        </strong>
                        )
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                      scoringStrategy === 'bloomWeight'
                        ? 'bg-indigo-50/60 border-indigo-300 ring-1 ring-indigo-200'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
                    }`}
                  >
                    <input
                      type="radio"
                      name="scoringStrategy"
                      checked={scoringStrategy === 'bloomWeight'}
                      onChange={() => setScoringStrategy('bloomWeight')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        Tính điểm theo trọng số Bloom
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Nhận biết ({bloomWeights.remember}đ) • Thông hiểu ({bloomWeights.understand}đ) • Vận dụng ({bloomWeights.apply}đ)
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Card: Cấu hình Bảng Ma trận đề thi */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                    2. Cấu hình bảng Ma trận đề thi (Chương/Chủ đề &rarr; Đơn vị kiến thức &rarr; CLO)
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Nhập số lượng câu hỏi cần bốc cho từng mức độ nhận thức Bloom tại mỗi đơn vị kiến thức
                </p>
              </div>

              {/* Summary pill */}
              <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700">
                <span>Tổng số câu:</span>
                <span className="text-indigo-700 text-sm font-extrabold">{totalExamQuestions} câu</span>
              </div>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4 w-[28%]">Chương / Chủ đề & Đơn vị kiến thức</th>
                    <th className="py-3 px-3 w-[18%]">Chuẩn đầu ra (CLO)</th>
                    <th className="py-3 px-3 text-center w-[16%]">
                      <div className="inline-flex items-center gap-1 text-emerald-700">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>Nhận biết</span>
                      </div>
                    </th>
                    <th className="py-3 px-3 text-center w-[16%]">
                      <div className="inline-flex items-center gap-1 text-blue-700">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span>Thông hiểu</span>
                      </div>
                    </th>
                    <th className="py-3 px-3 text-center w-[16%]">
                      <div className="inline-flex items-center gap-1 text-indigo-700">
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        <span>Vận dụng</span>
                      </div>
                    </th>
                    <th className="py-3 px-4 text-right w-[10%]">Tổng câu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {matrixRows.map((row, idx) => {
                    const rowTotal =
                      Number(row.reqRemember || 0) +
                      Number(row.reqUnderstand || 0) +
                      Number(row.reqApply || 0);

                    return (
                      <tr key={row.rowId} className="hover:bg-slate-50/60 transition-colors">
                        {/* Chương & Đơn vị kiến thức */}
                        <td className="py-3 px-4">
                          <div className="text-[11px] text-slate-400 font-medium">
                            {row.chapterName}
                          </div>
                          <div className="font-bold text-slate-900 mt-0.5">
                            {row.topicName}
                          </div>
                        </td>

                        {/* Chuẩn CLO */}
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {row.cloCode}
                          </span>
                          <p className="text-[11px] text-slate-500 mt-1 line-clamp-1" title={row.cloDesc}>
                            {row.cloDesc}
                          </p>
                        </td>

                        {/* Nhận biết */}
                        <td className="py-3 px-3 text-center">
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={row.reqRemember}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              setMatrixRows((prev) =>
                                prev.map((r) =>
                                  r.rowId === row.rowId ? { ...r, reqRemember: val } : r
                                )
                              );
                            }}
                            className="w-16 h-8 text-center text-xs font-bold rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800"
                          />
                        </td>

                        {/* Thông hiểu */}
                        <td className="py-3 px-3 text-center">
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={row.reqUnderstand}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              setMatrixRows((prev) =>
                                prev.map((r) =>
                                  r.rowId === row.rowId ? { ...r, reqUnderstand: val } : r
                                )
                              );
                            }}
                            className="w-16 h-8 text-center text-xs font-bold rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
                          />
                        </td>

                        {/* Vận dụng */}
                        <td className="py-3 px-3 text-center">
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={row.reqApply}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              setMatrixRows((prev) =>
                                prev.map((r) =>
                                  r.rowId === row.rowId ? { ...r, reqApply: val } : r
                                )
                              );
                            }}
                            className="w-16 h-8 text-center text-xs font-bold rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                          />
                        </td>

                        {/* Tổng câu row */}
                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                          {rowTotal} câu
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100/80 border-t-2 border-slate-200 text-xs font-extrabold text-slate-900">
                    <td colSpan={2} className="py-3 px-4 uppercase tracking-wider">
                      Tổng số lượng câu hỏi toàn đề
                    </td>
                    <td className="py-3 px-3 text-center text-emerald-800 font-bold">
                      {totalRemember} câu
                    </td>
                    <td className="py-3 px-3 text-center text-blue-800 font-bold">
                      {totalUnderstand} câu
                    </td>
                    <td className="py-3 px-3 text-center text-indigo-800 font-bold">
                      {totalApply} câu
                    </td>
                    <td className="py-3 px-4 text-right text-indigo-900 font-black text-sm">
                      {totalExamQuestions} câu
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* CTA Step 1 Footer */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Hủy bỏ
            </button>

            <button
              type="button"
              disabled={totalExamQuestions === 0 || !examTitle.trim()}
              onClick={() => {
                performAutoExtraction();
                setCurrentStep(2);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-white shadow-xs transition-transform active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <span>Tiếp tục: Bốc câu hỏi tự động</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BƯỚC 2: KIỂM TRA KHẢ DỤNG & BỐC CÂU HỎI TỰ ĐỘNG */}
      {/* ========================================================================= */}
      {currentStep === 2 && (
        <div className="space-y-5">
          {/* Status banner */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              cellAvailabilityStatus.allSufficient
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                : 'bg-amber-50/80 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-start gap-3">
              {cellAvailabilityStatus.allSufficient ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div>
                <h3 className="text-sm font-bold">
                  {cellAvailabilityStatus.allSufficient
                    ? 'Ngân hàng câu hỏi [Đã duyệt] hoàn toàn đủ đáp ứng ma trận OBE!'
                    : `Cảnh báo: Kho câu hỏi đang thiếu ${cellAvailabilityStatus.totalMissing} câu ở trạng thái [Đã duyệt]`}
                </h3>
                <p className="text-xs mt-0.5 opacity-90">
                  {cellAvailabilityStatus.allSufficient
                    ? `Đã tự động gom ngẫu nhiên đủ ${totalExamQuestions} câu hỏi bám sát cấu trúc từng hàng ma trận.`
                    : 'Vui lòng bổ sung số câu còn thiếu bằng cách bấm [+ Tạo thủ công] hoặc [🤖 AI sinh bổ sung] trực tiếp tại các ô cảnh báo dưới đây.'}
                </p>
              </div>
            </div>

            {/* Quick Auto-Fill All button if missing */}
            {!cellAvailabilityStatus.allSufficient && (
              <button
                type="button"
                onClick={() => {
                  cellAvailabilityStatus.details.forEach((item) => {
                    const row = matrixRows.find((r) => r.rowId === item.rowId);
                    if (!row) return;
                    if (item.remember.missing > 0) {
                      handleAISupplementCell(row, 'remember', item.remember.missing);
                    }
                    if (item.understand.missing > 0) {
                      handleAISupplementCell(row, 'understand', item.understand.missing);
                    }
                    if (item.apply.missing > 0) {
                      handleAISupplementCell(row, 'apply', item.apply.missing);
                    }
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs cursor-pointer self-start sm:self-auto shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI sinh bù tất cả câu thiếu</span>
              </button>
            )}
          </div>

          {/* Availability Details Table */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Chi tiết quét cơ sở dữ liệu câu hỏi [Đã duyệt] theo ma trận
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hệ thống đối soát từng ô yêu cầu với số lượng thực tế trong kho đã duyệt
                </p>
              </div>
              <button
                type="button"
                onClick={performAutoExtraction}
                className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-600 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Quét lại</span>
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {matrixRows.map((row) => {
                const statusDetail = cellAvailabilityStatus.details.find(
                  (d) => d.rowId === row.rowId
                );
                if (!statusDetail) return null;

                return (
                  <div key={row.rowId} className="p-4 hover:bg-slate-50/50 transition-colors">
                    {/* Row Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase">
                          {row.chapterName}
                        </span>
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">
                          {row.topicName}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 self-start sm:self-auto">
                        {row.cloCode}
                      </span>
                    </div>

                    {/* 3 Bloom Cells Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* 1. Nhận biết */}
                      <div
                        className={`p-3 rounded-lg border text-xs transition-all ${
                          statusDetail.remember.missing === 0
                            ? 'bg-emerald-50/40 border-emerald-200'
                            : 'bg-rose-50/50 border-rose-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-slate-700 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            Nhận biết: {row.reqRemember} câu
                          </span>
                          {statusDetail.remember.missing === 0 ? (
                            <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                              <Check className="w-3 h-3" /> Đủ câu ({statusDetail.remember.avail} sẵn có)
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-rose-700 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Thiếu {statusDetail.remember.missing} câu
                            </span>
                          )}
                        </div>

                        {statusDetail.remember.missing > 0 && (
                          <div className="mt-2 pt-2 border-t border-rose-200 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setManualModalCell({ row, bloom: 'remember' })}
                              className="flex-1 py-1 px-2 rounded bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>+ Tạo thủ công</span>
                            </button>
                            <button
                              type="button"
                              disabled={aiGeneratingCell === `${row.rowId}-remember`}
                              onClick={() =>
                                handleAISupplementCell(row, 'remember', statusDetail.remember.missing)
                              }
                              className="flex-1 py-1 px-2 rounded bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-semibold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>
                                {aiGeneratingCell === `${row.rowId}-remember`
                                  ? 'Đang sinh...'
                                  : '🤖 AI sinh bổ sung'}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 2. Thông hiểu */}
                      <div
                        className={`p-3 rounded-lg border text-xs transition-all ${
                          statusDetail.understand.missing === 0
                            ? 'bg-blue-50/40 border-blue-200'
                            : 'bg-rose-50/50 border-rose-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-slate-700 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                            Thông hiểu: {row.reqUnderstand} câu
                          </span>
                          {statusDetail.understand.missing === 0 ? (
                            <span className="text-[11px] font-bold text-blue-700 flex items-center gap-1">
                              <Check className="w-3 h-3" /> Đủ câu ({statusDetail.understand.avail} sẵn có)
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-rose-700 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Thiếu {statusDetail.understand.missing} câu
                            </span>
                          )}
                        </div>

                        {statusDetail.understand.missing > 0 && (
                          <div className="mt-2 pt-2 border-t border-rose-200 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setManualModalCell({ row, bloom: 'understand' })}
                              className="flex-1 py-1 px-2 rounded bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>+ Tạo thủ công</span>
                            </button>
                            <button
                              type="button"
                              disabled={aiGeneratingCell === `${row.rowId}-understand`}
                              onClick={() =>
                                handleAISupplementCell(row, 'understand', statusDetail.understand.missing)
                              }
                              className="flex-1 py-1 px-2 rounded bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-semibold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>
                                {aiGeneratingCell === `${row.rowId}-understand`
                                  ? 'Đang sinh...'
                                  : '🤖 AI sinh bổ sung'}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 3. Vận dụng */}
                      <div
                        className={`p-3 rounded-lg border text-xs transition-all ${
                          statusDetail.apply.missing === 0
                            ? 'bg-indigo-50/40 border-indigo-200'
                            : 'bg-rose-50/50 border-rose-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-slate-700 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                            Vận dụng: {row.reqApply} câu
                          </span>
                          {statusDetail.apply.missing === 0 ? (
                            <span className="text-[11px] font-bold text-indigo-700 flex items-center gap-1">
                              <Check className="w-3 h-3" /> Đủ câu ({statusDetail.apply.avail} sẵn có)
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-rose-700 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Thiếu {statusDetail.apply.missing} câu
                            </span>
                          )}
                        </div>

                        {statusDetail.apply.missing > 0 && (
                          <div className="mt-2 pt-2 border-t border-rose-200 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setManualModalCell({ row, bloom: 'apply' })}
                              className="flex-1 py-1 px-2 rounded bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>+ Tạo thủ công</span>
                            </button>
                            <button
                              type="button"
                              disabled={aiGeneratingCell === `${row.rowId}-apply`}
                              onClick={() =>
                                handleAISupplementCell(row, 'apply', statusDetail.apply.missing)
                              }
                              className="flex-1 py-1 px-2 rounded bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-semibold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>
                                {aiGeneratingCell === `${row.rowId}-apply`
                                  ? 'Đang sinh...'
                                  : '🤖 AI sinh bổ sung'}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CTA Step 2 Footer */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Quay lại Bước 1</span>
            </button>

            <button
              type="button"
              disabled={!cellAvailabilityStatus.allSufficient}
              onClick={() => {
                performAutoExtraction();
                setCurrentStep(3);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-white shadow-xs transition-transform active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--primary)' }}
              title={
                !cellAvailabilityStatus.allSufficient
                  ? 'Vui lòng bổ sung đầy đủ các câu hỏi còn thiếu trước khi tiếp tục'
                  : ''
              }
            >
              <span>Tiếp tục: Xem trước & Tinh chỉnh</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BƯỚC 3: XEM TRƯỚC, ĐỔI CÂU TƯƠNG ĐƯƠNG & TRỘN MÃ ĐỀ */}
      {/* ========================================================================= */}
      {currentStep === 3 && (
        <div className="space-y-5">
          {/* Card: Cấu hình trộn đề (Hoán vị) */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Shuffle className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  Cấu hình trộn đề thi (Hoán vị mã đề)
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                Tổng cộng: <strong className="text-slate-900">{pickedQuestions.length} câu hỏi</strong> • Thang điểm 10.0
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Chọn số lượng mã đề sinh */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Số lượng mã đề cần sinh hoán vị
                </label>
                <div className="flex items-center gap-2">
                  {[
                    { count: 1, label: '1 mã đề (Gốc)' },
                    { count: 2, label: '2 mã đề (101, 102)' },
                    { count: 4, label: '4 mã đề (101-104)' },
                  ].map((item) => (
                    <button
                      key={item.count}
                      type="button"
                      onClick={() => setExamCodeCount(item.count as 1 | 2 | 4)}
                      className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        examCodeCount === item.count
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700 ring-1 ring-indigo-200'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tùy chọn hoán vị */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tùy chọn xáo trộn nội dung
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shuffleQuestions}
                      onChange={(e) => setShuffleQuestions(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>[✓] Tự động đảo thứ tự câu hỏi</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shuffleOptions}
                      onChange={(e) => setShuffleOptions(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>[✓] Tự động hoán vị thứ tự 4 đáp án A, B, C, D</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Tab selector for previewing code */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
                <span>Xem trước theo mã đề:</span>
                {(examCodeCount === 4 ? ['101', '102', '103', '104'] : examCodeCount === 2 ? ['101', '102'] : ['101']).map(
                  (code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setPreviewCodeTab(code)}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-bold cursor-pointer transition-colors ${
                        previewCodeTab === code
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Mã {code}
                    </button>
                  )
                )}
              </div>

              <div className="text-[11px] text-slate-400">
                * Bấm nút <strong>[ 🔄 Đổi câu khác ]</strong> tại từng thẻ nếu muốn thay câu hỏi tương đương
              </div>
            </div>
          </div>

          {/* Questions Cards List */}
          <div className="space-y-3">
            {pickedQuestions.map((item, index) => {
              const bloomConf = BLOOM_3_CONFIG[item.bloom];

              return (
                <div
                  key={item.question.id}
                  className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-2xs transition-all hover:border-slate-300"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-7 h-7 rounded-lg bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                        #{index + 1}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {item.cloCode}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold border ${bloomConf.bgClass} ${bloomConf.textClass} ${bloomConf.borderClass}`}
                      >
                        {bloomConf.label}
                      </span>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {item.points} điểm
                      </span>
                    </div>

                    {/* Button Đổi câu khác */}
                    <button
                      type="button"
                      onClick={() => handleReplaceEquivalentQuestion(index)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer shrink-0"
                      title="Hệ thống tự bốc câu khác trong kho có cùng CLO và mức Bloom để thay thế"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                      <span>🔄 Đổi câu khác</span>
                    </button>
                  </div>

                  {/* Question Content */}
                  <div className="pt-3">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 leading-relaxed">
                      {item.question.content}
                    </p>

                    {/* 4 Options */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                      {item.question.options.map((opt, optIndex) => {
                        const isCorrect = optIndex === item.question.correctIndex;
                        return (
                          <div
                            key={optIndex}
                            className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                              isCorrect
                                ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 font-medium'
                                : 'bg-slate-50/60 border-slate-200 text-slate-700'
                            }`}
                          >
                            <span
                              className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[11px] shrink-0 ${
                                isCorrect
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {String.fromCharCode(65 + optIndex)}
                            </span>
                            <span className="flex-1">{opt}</span>
                            {isCorrect && (
                              <span className="text-[10px] font-bold uppercase text-emerald-700 bg-emerald-100/80 px-1.5 py-0.2 rounded">
                                Đáp án đúng
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CTA Step 3 Footer */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Quay lại Bước 2</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCurrentStep(4);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-white shadow-xs transition-transform active:scale-[0.98] cursor-pointer"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <span>Tiếp tục: Xuất bản đề thi</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BƯỚC 4: XUẤT BẢN ĐỀ THI (2 PHƯƠNG ÁN ĐẦU RA) */}
      {/* ========================================================================= */}
      {currentStep === 4 && (
        <div className="space-y-5">
          {/* Exam Summary Header Card */}
          <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Chuẩn hóa cấu trúc Ma trận OBE
                </span>
                <h2 className="text-xl font-bold mt-2 font-['Plus_Jakarta_Sans',sans-serif]">
                  {examTitle}
                </h2>
                <p className="text-xs text-slate-300 mt-1">
                  Học phần: {currentCourse.code} - {currentCourse.name} • Thời lượng: {durationMinutes} phút
                </p>
              </div>

              <div className="flex items-center gap-2 sm:self-center">
                <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/10 text-center min-w-[90px]">
                  <span className="text-[10px] uppercase font-bold text-slate-300 block">Số lượng câu</span>
                  <span className="text-xl font-black text-white">{pickedQuestions.length}</span>
                </div>
                <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/10 text-center min-w-[90px]">
                  <span className="text-[10px] uppercase font-bold text-slate-300 block">Mã đề hoán vị</span>
                  <span className="text-xl font-black text-emerald-400">{examCodeCount} mã</span>
                </div>
              </div>
            </div>

            {/* Generated Exam Codes Tags */}
            <div className="pt-2 border-t border-white/10 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-slate-300 font-medium">Các mã đề thi chính thức:</span>
              {(examCodeCount === 4 ? ['101', '102', '103', '104'] : ['101', '102']).map((c) => (
                <span
                  key={c}
                  className="px-2.5 py-0.5 rounded bg-white/15 text-white font-mono font-bold border border-white/10"
                >
                  Mã {c}
                </span>
              ))}
            </div>
          </div>

          {/* 2 Output Options Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Phương án 1: Thi giấy - Offline */}
            <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold mb-3 border border-blue-100">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Phương án 1: Thi trên giấy (Offline)
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Tự động định dạng trang chuẩn thi học kỳ: Tiêu đề Trường/Khoa, ô điền Họ tên/MSSV, nội dung đề thi các mã hoán vị và bảng Đáp án (Answer Key) ở trang cuối.
                </p>

                <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs text-slate-600 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Bộ tài liệu Word (.docx) đầy đủ {examCodeCount} mã đề</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Bảng ma trận phân bổ kiến thức & Đáp án cho Ban chấm thi</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleExportWord}
                  className="flex-1 py-2.5 px-3 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>📄 Xuất Word (.docx)</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="flex-1 py-2.5 px-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>🖨️ Xuất PDF</span>
                </button>
              </div>
            </div>

            {/* Phương án 2: Thi trực tuyến - Online */}
            <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold mb-3 border border-indigo-100">
                  <RadioIcon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Phương án 2: Thi trực tuyến (Online qua Link/MSSV)
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Thiết lập ca thi trực tuyến tức thì. Sinh đường link phòng thi và mã ca thi để thí sinh truy cập trực tiếp bằng Họ tên và MSSV mà không cần đăng ký tài khoản rườm rà.
                </p>

                <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs text-slate-600 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-indigo-700 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Mã ca thi sinh ngẫu nhiên: <strong>{generatedRoomCode}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-indigo-700 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Đồng hồ đếm ngược {durationMinutes} phút, tự động nộp bài khi hết giờ</span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setOnlineModalOpen(true)}
                  className="w-full py-2.5 px-4 rounded-lg text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-transform active:scale-[0.98] cursor-pointer"
                  style={{ backgroundColor: 'var(--primary)' }}
                >
                  <Send className="w-4 h-4" />
                  <span>🚀 Tạo ca thi trực tuyến ngay</span>
                </button>
              </div>
            </div>
          </div>

          {/* Done & Return */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Quay lại Bước 3</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleFinishExamCreation();
                onCancel();
              }}
              className="px-5 py-2.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
            >
              ✓ Hoàn tất & Quay lại Quản lý đề thi
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUICK MANUAL QUESTION CREATION MODAL (Step 2) */}
      {/* ========================================================================= */}
      {manualModalCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setManualModalCell(null)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg z-10 animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  {manualModalCell.row.cloCode} • {BLOOM_3_CONFIG[manualModalCell.bloom].label}
                </span>
                <h3 className="text-sm font-bold text-slate-900 mt-1">
                  Tạo câu hỏi thủ công bổ sung
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setManualModalCell(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nội dung câu hỏi <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={manualContent}
                  onChange={(e) => setManualContent(e.target.value)}
                  placeholder="Nhập nội dung câu hỏi..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  4 Phương án trả lời (chọn radio đáp án đúng)
                </label>
                <div className="space-y-1.5">
                  {manualOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="manualCorrect"
                        checked={manualCorrectIndex === i}
                        onChange={() => setManualCorrectIndex(i)}
                        className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        title="Đặt làm đáp án đúng"
                      />
                      <span className="w-4 font-bold text-slate-500">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const val = e.target.value;
                          setManualOptions((prev) => {
                            const cl = [...prev];
                            cl[i] = val;
                            return cl;
                          });
                        }}
                        placeholder={`Nội dung phương án ${String.fromCharCode(65 + i)}`}
                        className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-200 focus:ring-1 focus:ring-indigo-600 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-3.5 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/60">
              <button
                type="button"
                onClick={() => setManualModalCell(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveManualQuestion}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs cursor-pointer"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                Lưu vào kho & Duyệt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ONLINE EXAM SESSION MODAL (Step 4) */}
      {/* ========================================================================= */}
      {onlineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setOnlineModalOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md z-10 animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                  <RadioIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Khởi tạo ca thi trực tuyến
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Sinh link phòng thi và mã ca thi cho sinh viên
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOnlineModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Exam code display */}
              <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-200/80">
                <div className="text-[11px] font-bold text-indigo-900 uppercase">
                  Mã ca thi (Exam Code)
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono text-xl font-black text-indigo-700 tracking-wider">
                    {generatedRoomCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedRoomCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-white text-indigo-700 border border-indigo-200 text-xs font-bold hover:bg-indigo-50 cursor-pointer shadow-2xs"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? 'Đã chép' : 'Sao chép'}</span>
                  </button>
                </div>
              </div>

              {/* Link phong thi */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Đường dẫn phòng thi (Gửi cho sinh viên)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={`https://examflow.edu.vn/room/${generatedRoomCode}`}
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 font-mono text-slate-800 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`https://examflow.edu.vn/room/${generatedRoomCode}`);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="px-3 py-2 rounded-lg bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 cursor-pointer shrink-0"
                  >
                    {copiedLink ? 'Đã sao chép' : 'Copy link'}
                  </button>
                </div>
              </div>

              {/* Thời gian mở/đóng ca */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Giờ mở phòng
                  </label>
                  <input
                    type="time"
                    value={onlineStartTime}
                    onChange={(e) => setOnlineStartTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Giờ đóng phòng
                  </label>
                  <input
                    type="time"
                    value={onlineEndTime}
                    onChange={(e) => setOnlineEndTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setOnlineModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  setOnlineModalOpen(false);
                  handleFinishExamCreation();
                  onNavigateToOnlineSession(examTitle, generatedRoomCode);
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold text-white shadow-xs cursor-pointer flex items-center gap-1.5"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                <span>Mở ca thi & Đến màn hình giám sát</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
