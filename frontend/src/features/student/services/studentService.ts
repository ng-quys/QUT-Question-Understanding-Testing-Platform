import { apiFetch } from '../../../services/api';

export interface StudentSession {
  sessionId: number;
  examId: number;
  examCode: string;
  examTitle: string;
  courseCode: string;
  courseName: string;
  roomCode: string;
  startTime: string;
  endTime: string;
  sessionStatus: string;
  registrationStatus: string;
  durationMinutes: number;
  questionCount: number;
  totalPoints: number;
  attemptId: number | null;
  attemptStatus: string | null;
  score: number | null;
  canStart: boolean;
  requiresAccessCode: boolean;
}

export interface CloAchievement {
  cloId: number;
  cloCode: string;
  description: string;
  answeredQuestions: number;
  correctQuestions: number;
  achievementPercent: number;
}

export interface StudentResult {
  attemptId: number;
  examId: number;
  examCode: string;
  examTitle: string;
  courseCode: string;
  courseName: string;
  score: number;
  totalPoints: number;
  submittedAt: string;
  status: string;
  correctAnswers: number;
  totalQuestions: number;
  cloAchievement: CloAchievement[];
}

export interface StudentDashboard {
  studentId: number;
  fullName: string;
  email: string;
  department: string;
  upcomingSessions: number;
  ongoingSessions: number;
  completedExams: number;
  averageScore: number;
  sessions: StudentSession[];
  recentResults: StudentResult[];
}

export interface ExamOption {
  id: number;
  label: string;
  content: string;
}

export interface ExamQuestion {
  questionId: number;
  position: number;
  content: string;
  points: number;
  cloCode?: string;
  options: ExamOption[];
  selectedAnswerId: number | null;
}


export interface StudentProfile {
  studentId: number;
  username: string;
  email: string;
  fullName: string;
  department?: string;
  status?: string;
  hasFacePhoto: boolean;
}

export interface ExamSearchResult {
  sessionId: number;
  examId: number;
  examCode: string;
  examTitle: string;
  courseCode: string;
  courseName: string;
  sessionName: string;
  roomCode: string;
  startTime: string;
  endTime: string;
  sessionStatus: string;
  durationMinutes: number;
  totalQuestions: number;
  totalPoints: number;
  alreadyAttempted: boolean;
  attemptStatus: string | null;
  canEnter: boolean;
  requiresAccessCode: boolean;
  message: string;
}

export interface JoinExamResult {
  sessionId: number;
  examCode: string;
  examTitle: string;
  courseCode: string;
  courseName: string;
  roomCode: string;
  startTime: string;
  endTime: string;
  message: string;
}

export interface StudentAttempt {
  attemptId: number;
  sessionId: number;
  examId: number;
  examCode: string;
  examTitle: string;
  courseCode: string;
  courseName: string;
  durationMinutes: number;
  totalPoints: number;
  startedAt: string;
  endTime: string;
  status: string;
  questions: ExamQuestion[];
}

// ============================================================
// M7 - BROWSER EVENTS
// ============================================================

export type BrowserViolation =
  | 'TAB_HIDDEN'
  | 'FULLSCREEN_EXIT'
  | 'WINDOW_BLUR'
  | 'COPY'
  | 'PASTE'
  | 'RIGHT_CLICK';

export interface AiStatus {
  required: boolean;
  ready: boolean;
  status: string;
  message: string;
}

export const studentApi = {
  aiStatus: (id: number) => apiFetch<AiStatus>(`/student/attempts/${id}/ai-status`),
  dashboard: () => apiFetch<StudentDashboard>('/student/dashboard'),

  sessions: () =>
    apiFetch<StudentSession[]>('/student/sessions'),

  results: () =>
    apiFetch<StudentResult[]>('/student/results'),

  result: (attemptId: number) =>
    apiFetch<StudentResult>(`/student/results/${attemptId}`),

  startExam: (sessionId: number, roomCode: string, accessCode?: string) =>
    apiFetch<StudentAttempt>(
      `/student/sessions/${sessionId}/start`,
      {
        method: 'POST',
        body: JSON.stringify({
          roomCode,
          accessCode: accessCode || null,
        }),
      },
    ),

  getAttempt: (attemptId: number) =>
    apiFetch<StudentAttempt>(
      `/student/attempts/${attemptId}`,
    ),

  saveAnswer: (
    attemptId: number,
    questionId: number,
    answerId: number,
  ) =>
    apiFetch<{ message: string }>(
      `/student/attempts/${attemptId}/answer`,
      {
        method: 'PUT',
        body: JSON.stringify({
          questionId,
          answerId,
        }),
      },
    ),

  submit: (
    attemptId: number,
    answers: Array<{
      questionId: number;
      answerId: number;
    }>,
  ) =>
    apiFetch<StudentResult>(
      `/student/attempts/${attemptId}/submit`,
      {
        method: 'POST',
        body: JSON.stringify({ answers }),
      },
    ),

  // ==========================================================
  // M7 - SEND BROWSER EVENT TO QUT BACKEND
  // ==========================================================

  browserEvent: (
    attemptId: number,
    event: BrowserViolation,
    active = true,
  ) =>
    apiFetch<{ message: string }>(
      `/student/attempts/${attemptId}/browser-events`,
      {
        method: 'POST',
        body: JSON.stringify({
          event,
          active,
          timestamp: new Date().toISOString(),
        }),
      },
    ),

  uploadPhoto: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiFetch<{ message: string }>('/student/profile/photo', { method: 'POST', body: form });
  },

  profile: () =>
    apiFetch<StudentProfile>('/student/profile'),

  searchExam: (code: string) =>
    apiFetch<ExamSearchResult>('/student/exams/search', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  joinExam: (code: string) =>
    apiFetch<JoinExamResult>('/student/exams/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
};
