import { Course, CourseChapter, CourseCLO, QuestionItem, Bloom3Level } from '../../../types';

export interface MatrixKnowledgeUnit {
  id: string;
  chapterId: string;
  name: string;
  cloId: string;
  nb: number; // Nhận biết / Remember
  th: number; // Thông hiểu / Understand
  vd: number; // Vận dụng / Apply
  order?: number;
}

export interface MatrixCustomConfig {
  targetTotal?: number;
  showAvailability: boolean;
  pointsPerQuestion: number;
  enableDistributionControl: boolean; // Switch toggle: Bật/Tắt tính năng kiểm soát Tỉ lệ phân bổ định hướng
  bloomGuidance: {
    nb: number;
    th: number;
    vd: number;
  };
}

export interface MatrixSummaryStats {
  totalNB: number;
  totalTH: number;
  totalVD: number;
  matrixTotal: number;
  percentNB: number;
  percentTH: number;
  percentVD: number;
}

export interface RowValidation {
  hasNoCLO: boolean;
  hasNoTitle: boolean;
  isZeroCount: boolean;
  availableCount: number;
  requiredCount: number;
  isDeficient: boolean;
}

export interface MatrixValidationResult {
  isValid: boolean;
  issues: string[];
  unitValidationMap: Record<string, RowValidation>;
}
