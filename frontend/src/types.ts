export type UserRole = 'faculty' | 'student';

export type DashboardNavTab =
  | 'overview'
  | 'courses'
  | 'question-bank'
  | 'new-question'
  | 'ai-generator'
  | 'quick-exam'
  | 'exams'
  | 'exam-sessions'
  | 'settings';

export interface SlideData {
  id: number;
  tag: string;
  title: string;
  description: string;
  stats?: {
    label: string;
    value: string;
  }[];
  visualType: 'question-bank' | 'ai-generator' | 'exam-analytics';
}

export interface LoginFormData {
  email: string;
  password: string;
  role: UserRole;
  rememberMe: boolean;
}

export interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

export type ExamStatus = 'completed' | 'upcoming' | 'ongoing';

// Cognitive Levels for Blooms taxonomy
export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze';
export type Bloom3Level = 'remember' | 'understand' | 'apply';

// Multi-dimensional Classification: Course, Chapter, Topic
export interface CourseTopic {
  id: string;
  chapterId: string;
  code: string;
  name: string;
  questionCount: number;
}

export interface CourseChapter {
  id: string;
  courseId: string;
  order: number;
  code: string;
  name: string;
  topics: CourseTopic[];
}

export interface CourseCLO {
  id: string;
  courseId: string;
  code: string;
  description: string;
  defaultBloom: Bloom3Level;
  status: 'active' | 'draft';
  notes?: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  credits: number;
  department: string;
  chaptersCount: number;
  cloCount: number;
  questionCount: number;
  status: 'active' | 'draft';
  updatedAt: string;
}

// 3D Metadata Question
export interface QuestionItem {
  id: string;
  courseId: string;
  chapterId: string;
  topicId: string;
  cloId: string;
  bloom: Bloom3Level;
  content: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  status: 'approved' | 'pending' | 'rejected';
  source: 'manual' | 'ai';
  updatedAt: string;
  default_score?: number;
  aiSuggestedMeta?: {
    topicName?: string;
    cloCode?: string;
    bloom?: Bloom3Level;
    sourceDocumentName?: string;
  };
}

// Matrix Exam Builder Requirements
export interface MatrixRequirement {
  id: string;
  courseId: string;
  chapterId?: string; // Optional filter to chapter
  topicId?: string; // Optional filter to specific topic
  cloId: string;
  bloom: Bloom3Level;
  quantity: number;
  pointsPerQuestion: number;
}

export interface MatrixExamConfig {
  title: string;
  courseId: string;
  code: string;
  durationMinutes: number;
  totalPoints: number;
  requirements: MatrixRequirement[];
}

export interface ExamRecord {
  id: string;
  title: string;
  subject: string;
  studentCount: number;
  avgScore: number | null;
  status: ExamStatus;
  examDate: string;
  durationMinutes: number;
  questionCount: number;
  roomCode?: string;
}

export interface DashboardStat {
  id: string;
  label: string;
  value: string;
  changeText: string;
  changeType: 'positive' | 'neutral' | 'info';
  iconName: 'database' | 'file-text' | 'clock' | 'users';
}

export interface ScoreDistributionItem {
  range: string;
  count: number;
  percentage: number;
  color?: string;
}

export interface PerformancePoint {
  month: string;
  avgScore: number;
  passRate: number;
  totalExams: number;
}

export interface CLOItem {
  id: string;
  code: string;
  description: string;
  bloomLevel: BloomLevel;
  weightPercent: number;
}

export interface UploadedDocFile {
  id: string;
  name: string;
  size: string;
  type: 'pdf' | 'docx' | 'pptx' | 'other';
  uploadDate: string;
  status: 'ready' | 'processing';
}

export type WizardStepId = 1 | 2 | 3 | 4 | 5;

export interface ExamWizardData {
  // Step 1: Knowledge & CLO
  subjectId: string;
  semesterId: string;
  examTitle: string;
  examCode: string;
  durationMinutes: number;
  totalQuestions: number;
  uploadedFiles: UploadedDocFile[];
  clos: CLOItem[];
  saveCLOToDatabase: boolean;
  // Step 2: Matrix
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  // Step 3: Questions
  // Step 4: Customization
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  antiCheatingMode: boolean;
  scoringScale: string;
}

// ==========================================
// AI Question Generator 5-Step Workflow Types
// ==========================================
export type AIWorkflowStep = 1 | 2 | 3 | 4 | 5;

export type SupportedFileExtension = 'pdf' | 'docx' | 'txt';

export type FileUploadState =
  | 'idle'
  | 'validating'
  | 'ready'
  | 'uploading'
  | 'extracting'
  | 'success'
  | 'error';

export interface SourceDocument {
  id: string;
  file?: File;
  name: string;
  size: number; // in bytes
  sizeFormatted: string;
  extension: SupportedFileExtension;
  status: FileUploadState;
  errorMessage?: string;
  extractedText?: string;
  wordCount?: number;
  topicsDetected?: string[];
  uploadedAt?: string;
}

export interface DocumentExtractionSummary {
  documents: SourceDocument[];
  totalWords: number;
  totalDocuments: number;
  summary: string;
  keyConcepts: string[];
}

export interface AIGeneratorConfig {
  courseId: string;
  chapterId?: string;
  topicId: string;
  cloId: string;
  bloom: Bloom3Level;
  questionCount: number;
  generationMode: 'single' | 'matrix';
  matrixDistribution?: {
    remember: number;
    understand: number;
    apply: number;
  };
  promptNotes?: string;
  sourceDocIds: string[];
}

