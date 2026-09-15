import { Course, CourseChapter, CourseCLO, QuestionItem } from '../../../types';
import {
  MatrixKnowledgeUnit,
  MatrixSummaryStats,
  MatrixValidationResult,
  RowValidation,
} from './types';

/**
 * Calculates total questions for a single row: NB + TH + VD
 */
export function calculateRowTotal(unit: MatrixKnowledgeUnit): number {
  return (Number(unit.nb) || 0) + (Number(unit.th) || 0) + (Number(unit.vd) || 0);
}

/**
 * Calculates percentage of row relative to total matrix questions
 */
export function calculateRowPercentage(rowTotal: number, matrixTotal: number): string {
  if (!matrixTotal || matrixTotal <= 0) return '0%';
  const pct = (rowTotal / matrixTotal) * 100;
  return `${Math.round(pct * 10) / 10}%`;
}

/**
 * Calculates aggregated matrix summary and Bloom breakdown
 */
export function calculateMatrixSummary(units: MatrixKnowledgeUnit[]): MatrixSummaryStats {
  let totalNB = 0;
  let totalTH = 0;
  let totalVD = 0;

  for (const unit of units) {
    totalNB += Number(unit.nb) || 0;
    totalTH += Number(unit.th) || 0;
    totalVD += Number(unit.vd) || 0;
  }

  const matrixTotal = totalNB + totalTH + totalVD;

  const percentNB = matrixTotal > 0 ? Math.round((totalNB / matrixTotal) * 100) : 0;
  const percentTH = matrixTotal > 0 ? Math.round((totalTH / matrixTotal) * 100) : 0;
  const percentVD = matrixTotal > 0 ? Math.max(0, 100 - percentNB - percentTH) : 0;

  return {
    totalNB,
    totalTH,
    totalVD,
    matrixTotal,
    percentNB,
    percentTH,
    percentVD,
  };
}

/**
 * Validates matrix and checks availability against question bank
 */
export function validateMatrix(
  units: MatrixKnowledgeUnit[],
  questions: QuestionItem[],
  courseId: string
): MatrixValidationResult {
  const issues: string[] = [];
  const unitValidationMap: Record<string, RowValidation> = {};

  const summary = calculateMatrixSummary(units);

  if (summary.matrixTotal === 0) {
    issues.push('Tổng số câu hỏi trong ma trận phải lớn hơn 0.');
  }

  units.forEach((unit) => {
    const rowTotal = calculateRowTotal(unit);
    const hasNoCLO = !unit.cloId || unit.cloId.trim() === '';
    const hasNoTitle = !unit.name || unit.name.trim() === '';
    const isZeroCount = rowTotal === 0;

    // Check available questions in bank matching this course and topic/unit
    const matchingQuestions = questions.filter(
      (q) =>
        q.courseId === courseId &&
        (q.topicId === unit.id || q.topicId?.includes(unit.id) || q.chapterId === unit.chapterId) &&
        q.status === 'approved'
    );
    const availableCount = matchingQuestions.length;
    const isDeficient = rowTotal > 0 && availableCount < rowTotal;

    if (hasNoCLO) {
      issues.push(`Đơn vị "${unit.name || 'chưa đặt tên'}" chưa được gán chuẩn đầu ra (CLO).`);
    }
    if (hasNoTitle) {
      issues.push('Có đơn vị kiến thức chưa được nhập tên.');
    }

    unitValidationMap[unit.id] = {
      hasNoCLO,
      hasNoTitle,
      isZeroCount,
      availableCount,
      requiredCount: rowTotal,
      isDeficient,
    };
  });

  const isValid = summary.matrixTotal > 0 && !units.some((u) => !u.cloId || !u.name?.trim());

  return {
    isValid,
    issues,
    unitValidationMap,
  };
}

/**
 * Builds initial default matrix rows based on course chapters and topics
 */
export function buildInitialMatrixForCourse(
  courseId: string,
  chapters: CourseChapter[],
  clos: CourseCLO[]
): MatrixKnowledgeUnit[] {
  const courseChaps = chapters.filter((c) => c.courseId === courseId);
  const courseCLOs = clos.filter((c) => c.courseId === courseId);

  const units: MatrixKnowledgeUnit[] = [];

  // Default values to achieve ~50 questions across chapters
  // E.g. TI01 has 3 chapters with 2 topics each -> ~8-9 questions per topic = 50 total
  const defaultDistributions: { nb: number; th: number; vd: number }[] = [
    { nb: 5, th: 3, vd: 2 }, // 10
    { nb: 3, th: 4, vd: 3 }, // 10
    { nb: 4, th: 4, vd: 2 }, // 10
    { nb: 3, th: 4, vd: 3 }, // 10
    { nb: 2, th: 3, vd: 5 }, // 10
    { nb: 0, th: 0, vd: 0 },
  ];

  let distIndex = 0;

  courseChaps.forEach((chap, chapIdx) => {
    if (chap.topics && chap.topics.length > 0) {
      chap.topics.forEach((topic, topicIdx) => {
        const assignedCLO = courseCLOs[topicIdx % courseCLOs.length] || courseCLOs[0];
        const dist = defaultDistributions[distIndex % defaultDistributions.length] || {
          nb: 3,
          th: 3,
          vd: 2,
        };
        distIndex++;

        units.push({
          id: topic.id || `unit_${chap.id}_${topicIdx}`,
          chapterId: chap.id,
          name: topic.name,
          cloId: assignedCLO?.id || '',
          nb: dist.nb,
          th: dist.th,
          vd: dist.vd,
          order: topicIdx + 1,
        });
      });
    } else {
      // If chapter has no topics yet, add 1 default unit
      const assignedCLO = courseCLOs[chapIdx % courseCLOs.length] || courseCLOs[0];
      units.push({
        id: `unit_${chap.id}_default`,
        chapterId: chap.id,
        name: `${chap.name} (Kiến thức trọng tâm)`,
        cloId: assignedCLO?.id || '',
        nb: 5,
        th: 5,
        vd: 2,
        order: 1,
      });
    }
  });

  // Ensure matrix totals to 50 if it has 5 units: 10 + 10 + 10 + 10 + 10 = 50
  return units;
}

/**
 * Exports the Matrix to CSV with UTF-8 BOM so Excel opens cleanly
 */
export function exportMatrixToCSV(
  course: Course | undefined,
  chapters: CourseChapter[],
  units: MatrixKnowledgeUnit[],
  clos: CourseCLO[],
  summary: MatrixSummaryStats
): void {
  const courseCode = course?.code || 'MA-TRAN';
  const courseName = course?.name || 'Học phần';

  let csv = '\uFEFF'; // UTF-8 BOM for Excel
  csv += `MA TRẬN CÂU HỎI HỌC PHẦN: ${courseCode} - ${courseName}\n`;
  csv += `Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}\n`;
  csv += `Tổng số câu hỏi: ${summary.matrixTotal} | NB: ${summary.totalNB} (${summary.percentNB}%) | TH: ${summary.totalTH} (${summary.percentTH}%) | VD: ${summary.totalVD} (${summary.percentVD}%)\n\n`;

  // Headers
  csv += 'TT,Chương / Chủ đề,Đơn vị kiến thức,Chuẩn đầu ra (CLO),Nhận biết (NB),Thông hiểu (TH),Vận dụng (VD),Tổng số câu,Tỉ lệ (%)\n';

  let counter = 1;
  const courseChaps = chapters.filter((c) => !course || c.courseId === course.id);

  courseChaps.forEach((chap) => {
    const chapUnits = units.filter((u) => u.chapterId === chap.id);
    chapUnits.forEach((u) => {
      const clo = clos.find((c) => c.id === u.cloId);
      const cloLabel = clo ? `${clo.code}: ${clo.description.replace(/"/g, '""')}` : '';
      const rowTotal = calculateRowTotal(u);
      const pct = calculateRowPercentage(rowTotal, summary.matrixTotal);

      csv += `${counter},"${chap.code}: ${chap.name.replace(/"/g, '""')}","${u.name.replace(
        /"/g,
        '""'
      )}","${cloLabel}",${u.nb},${u.th},${u.vd},${rowTotal},"${pct}"\n`;
      counter++;
    });
  });

  // Total Footer
  csv += `\nTỔNG CỘNG,,,"",${summary.totalNB},${summary.totalTH},${summary.totalVD},${summary.matrixTotal},100%\n`;
  csv += `Cơ cấu mức độ,,,"",NB ${summary.percentNB}%,TH ${summary.percentTH}%,VD ${summary.percentVD}%,,\n`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Ma_tran_cau_hoi_${courseCode}_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
