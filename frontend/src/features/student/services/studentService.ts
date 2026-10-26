import { apiFetch } from '@shared/services/api';

export interface StudentSession {
  sessionId: number;
  examId: number;
  examCode: string;
  examTitle: string;
  courseCode: string;
  courseName: string;
  roomCode: string;
  sessionName?: string;
  roomName?: string;
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
  className?: string;
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
  roomName?: string;
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
  sessionName?: string;
  roomName?: string;
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

export interface CameraHealth { cameraVerified:boolean;cameraReason:string;cameraMessage:string }
export interface CameraCheck { required:boolean;verified:boolean;reason:string;message:string;verificationToken:string|null;expiresAt:number }
export interface AiStatus {
  cameraVerified?:boolean;
  cameraMessage?:string;
  cameraReason?:string;
  frameIntervalMs?: number;
  captureAllowed?: boolean;
  lease?: number;
  required: boolean;
  ready: boolean;
  status: string;
  message: string;
}

export const studentApi = {
  offlineGrant:(attempt:number)=>apiFetch<import('./offlineExam').OfflineGrant>(`/student/attempts/${attempt}/offline-grant`,{method:'POST',signal:AbortSignal.timeout(15000)}),
  offlineSubmit:(attempt:number,submission:import('./offlineExam').FrozenSubmission)=>apiFetch<StudentResult>(`/student/attempts/${attempt}/offline-submit`,{method:'POST',body:JSON.stringify(submission),signal:AbortSignal.timeout(20000)}),
  cameraRequirements:(session:number,signal?:AbortSignal)=>apiFetch<{required:boolean}>(`/student/sessions/${session}/camera-check`,{signal}),
  checkCamera:(session:number,jpeg:string,signal?:AbortSignal)=>apiFetch<CameraCheck>(`/student/sessions/${session}/camera-check`,{method:'POST',body:JSON.stringify({jpeg}),signal}),
  cameraHealth:(attempt:number,available:boolean,signal?:AbortSignal,reason='device_unavailable')=>apiFetch<CameraHealth>(`/student/attempts/${attempt}/camera-health`,{method:'POST',body:JSON.stringify({available,reason}),signal}),
  restoreCamera:(attempt:number,verificationToken:string|null)=>apiFetch<CameraHealth>(`/student/attempts/${attempt}/camera-restore`,{method:'POST',body:JSON.stringify({verificationToken})}),
  clock:()=>apiFetch<{serverTime:string}>('/student/clock',{signal:AbortSignal.timeout(10000)}),
  aiStatus: (id: number,signal?:AbortSignal) => apiFetch<AiStatus>(`/student/attempts/${id}/ai-status`,{signal}),
  aiFrame:(id:number,body:{lease:number;jpeg:string;audioPcm16:string},signal?:AbortSignal)=>apiFetch<{accepted:boolean}>(`/student/attempts/${id}/ai-frame`,{method:'POST',body:JSON.stringify(body),signal}),
  reconnectAi:(id:number)=>apiFetch(`/student/attempts/${id}/ai-reconnect`,{method:'POST',signal:AbortSignal.timeout(6000)}),
  dashboard: (signal?:AbortSignal) => apiFetch<StudentDashboard>('/student/dashboard',{signal}),

  sessions: () =>
    apiFetch<StudentSession[]>('/student/sessions'),

  results: () =>
    apiFetch<StudentResult[]>('/student/results'),

  result: (attemptId: number,signal?:AbortSignal) =>
    apiFetch<StudentResult>(`/student/results/${attemptId}`,{signal}),

  startExam: (sessionId: number, roomCode?: string, accessCode?: string, verificationToken?: string|null) =>
    apiFetch<StudentAttempt>(
      `/student/sessions/${sessionId}/start`,
      {
        method: 'POST',
        body: JSON.stringify({
          roomCode,
          accessCode: accessCode || null,
          verificationToken: verificationToken || null,
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
        signal: AbortSignal.timeout(8000),
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
        signal: AbortSignal.timeout(10000),
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
    signal?: AbortSignal,
  ) =>
    apiFetch<{ message: string }>(
      `/student/attempts/${attemptId}/browser-events`,
      {
        method: 'POST',
        signal,
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
