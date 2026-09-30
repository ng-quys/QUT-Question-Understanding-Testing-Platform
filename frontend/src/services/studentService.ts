import { apiFetch } from './api';

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

export const studentApi = {
  dashboard: () => apiFetch<StudentDashboard>('/student/dashboard'),
  sessions: () => apiFetch<StudentSession[]>('/student/sessions'),
  results: () => apiFetch<StudentResult[]>('/student/results'),
  result: (attemptId: number) => apiFetch<StudentResult>(`/student/results/${attemptId}`),
  startExam: (sessionId: number, accessCode?: string) =>
    apiFetch<StudentAttempt>(`/student/sessions/${sessionId}/start`, {
      method: 'POST',
      body: JSON.stringify({ accessCode: accessCode || null }),
    }),
  getAttempt: (attemptId: number) => apiFetch<StudentAttempt>(`/student/attempts/${attemptId}`),
  saveAnswer: (attemptId: number, questionId: number, answerId: number) =>
    apiFetch<{ message: string }>(`/student/attempts/${attemptId}/answer`, {
      method: 'PUT',
      body: JSON.stringify({ questionId, answerId }),
    }),
  submit: (attemptId: number, answers: Array<{ questionId: number; answerId: number }>) =>
    apiFetch<StudentResult>(`/student/attempts/${attemptId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),
};
