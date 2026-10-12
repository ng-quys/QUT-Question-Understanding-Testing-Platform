import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import {

  CalendarClock,

  CheckCircle2,

  Clock3,

  GraduationCap,

  LogOut,

  RefreshCw,

  Trophy,

  BookOpenCheck,

  ChevronRight,

  AlertCircle,
  User,
  Upload,
  X,
  QrCode,
  CheckCircle2 as ProfileCheckCircle2,

} from 'lucide-react';

import { logout, getAuthSession } from '../../auth/services/authService';
import { loadStudentPhoto } from '../services/studentPhotoService';

import {

  studentApi,

  type StudentDashboard,

  type StudentSession,

  type StudentAttempt,

  type StudentResult,
  type ExamSearchResult,

} from '../services/studentService';

import { ROUTES } from '../../../app/routes';

type View = 'overview' | 'sessions' | 'results' | 'profile' | 'join' | 'exam' | 'result-detail';

const fmt = (value?: string | null) => {

  if (!value) return '—';

  return new Date(value).toLocaleString('vi-VN', {

    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',

  });

};

export const StudentPortalPage: React.FC = () => {

  const navigate = useNavigate();

  const auth = getAuthSession();

  const [view, setView] = useState<View>('overview');

  const [dashboard, setDashboard] = useState<StudentDashboard | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState<StudentAttempt | null>(null);

  const [result, setResult] = useState<StudentResult | null>(null);

  const [selected, setSelected] = useState<Record<number, number>>({});

  const [savingQuestion, setSavingQuestion] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const [now, setNow] = useState(() => Date.now());
  const [violationCount, setViolationCount] = useState(0);
  const [profile, setProfile] = useState<import('../services/studentService').StudentProfile | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [startingAi, setStartingAi] = useState(false);
  const startLock = useRef(false);
  const [aiStatus, setAiStatus] = useState<import('../services/studentService').AiStatus | null>(null);

  useEffect(() => {
    if (view !== 'exam' || !attempt) { setAiStatus(null); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const status = await studentApi.aiStatus(attempt.attemptId);
        if (!cancelled) setAiStatus(status);
      } catch {
        if (!cancelled) setAiStatus({ required: true, ready: false, status: 'offline', message: 'Mất kết nối giám sát. Hãy kiểm tra dịch vụ AI và kết nối mạng.' });
      } finally {
        if (!cancelled) timer = setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [view, attempt?.attemptId]);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<ExamSearchResult | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  // ==========================================================
  // M7 - BROWSER / EXAM ENVIRONMENT MONITORING
  // ==========================================================

  const M7_VIOLATION_COOLDOWN_MS = 3000;

  type BrowserViolation =
    | 'TAB_HIDDEN'
    | 'FULLSCREEN_EXIT'
    | 'WINDOW_BLUR'
    | 'COPY'
    | 'PASTE'
    | 'RIGHT_CLICK';

  const [fullscreenActive, setFullscreenActive] = useState(
    Boolean(document.fullscreenElement),
  );

  const attemptRef = useRef<StudentAttempt | null>(null);
  const autoSubmittingRef = useRef(false);
  const lastViolation = useRef(0);
  const fullscreenMonitoringArmed = useRef(false);

  const enterExamFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }

      const active = Boolean(document.fullscreenElement);
      setFullscreenActive(active);
      return active;
    } catch (error) {
      console.warn('Không thể bật fullscreen:', error);
      setFullscreenActive(Boolean(document.fullscreenElement));
      return false;
    }
  };

  const sendM7Event = (
    event: BrowserViolation,
    active = true,
  ) => {
    const currentAttempt = attemptRef.current;

    if (!currentAttempt) {
      return;
    }

    void studentApi.browserEvent(
      currentAttempt.attemptId,
      event,
      active,
    ).catch(() => {
      // Keep local monitoring active if the backend is temporarily unavailable.
    });
  };

  const recordViolation = (type: BrowserViolation) => {
    const currentTime = Date.now();

    if (
      currentTime - lastViolation.current
      < M7_VIOLATION_COOLDOWN_MS
    ) {
      return;
    }

    lastViolation.current = currentTime;

    console.warn('M7 VIOLATION:', type);
    sendM7Event(type, true);

    setViolationCount(prev => {
      const next = prev + 1;

      if (next === 1) {
        setError(
          'Cảnh báo: Bạn đã rời khỏi môi trường thi (1/3). Vui lòng quay lại trang thi và fullscreen.',
        );
      }

      if (next >= 3 && !autoSubmittingRef.current) {
        autoSubmittingRef.current = true;
        setError(
          'Bạn đã vi phạm 3 lần. Hệ thống đang tự động nộp bài.',
        );

        window.setTimeout(() => {
          void handleSubmit(true);
        }, 300);
      }

      return next;
    });
  };

  // ==========================================================
  // M7 - FULLSCREEN / TAB / WINDOW FOCUS
  // ==========================================================

  useEffect(() => {
    if (view !== 'exam') {
      fullscreenMonitoringArmed.current = false;
      setFullscreenActive(Boolean(document.fullscreenElement));
      return;
    }

    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setFullscreenActive(active);

      if (!active) {
        if (fullscreenMonitoringArmed.current) {
          recordViolation('FULLSCREEN_EXIT');
        }
      } else {
        sendM7Event('FULLSCREEN_EXIT', false);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        recordViolation('TAB_HIDDEN');
      } else {
        sendM7Event('TAB_HIDDEN', false);
      }
    };

    const onWindowBlur = () => {
      // A tab switch often fires blur and visibilitychange together.
      // Let TAB_HIDDEN own that case so one action cannot become 2 violations.
      if (!document.hidden) {
        recordViolation('WINDOW_BLUR');
      }
    };

    const onWindowFocus = () => {
      sendM7Event('WINDOW_BLUR', false);
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [view]);

  // ==========================================================
  // M7 - COPY / PASTE / CUT / RIGHT CLICK
  // ==========================================================

  useEffect(() => {
    if (view !== 'exam') {
      return;
    }

    const blockCopy = (e: ClipboardEvent) => e.preventDefault();
    const blockPaste = (e: ClipboardEvent) => e.preventDefault();
    const blockCut = (e: ClipboardEvent) => e.preventDefault();
    const blockContextMenu = (e: MouseEvent) => e.preventDefault();

    const blockShortcut = (e: KeyboardEvent) => {
      if (e.ctrlKey && ['c', 'v', 'x'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };

    document.addEventListener('copy', blockCopy);
    document.addEventListener('paste', blockPaste);
    document.addEventListener('cut', blockCut);
    document.addEventListener('contextmenu', blockContextMenu);
    window.addEventListener('keydown', blockShortcut);

    return () => {
      document.removeEventListener('copy', blockCopy);
      document.removeEventListener('paste', blockPaste);
      document.removeEventListener('cut', blockCut);
      document.removeEventListener('contextmenu', blockContextMenu);
      window.removeEventListener('keydown', blockShortcut);
    };
  }, [view]);

  useEffect(() => {

    if (!auth || auth.role !== 'student') {

      navigate(ROUTES.LOGIN, { replace: true });

      return;

    }

    void loadDashboard();
    void loadProfile();

  }, []);

  useEffect(() => {

    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timer);

  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join');
    if (code) {
      setJoinCode(code);
      setView('join');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (profilePhotoUrl) URL.revokeObjectURL(profilePhotoUrl);
    };
  }, [profilePhotoUrl]);

  const loadDashboard = async () => {

    setLoading(true);

    setError(null);

    try {

      const data = await studentApi.dashboard();

      setDashboard(data);

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Không thể tải dữ liệu sinh viên');

    } finally {

      setLoading(false);

    }

  };

  const loadProfile = async () => {
    try {
      const data = await studentApi.profile();
      setProfile(data);

      if (data.hasFacePhoto) {
        const blob = await loadStudentPhoto();
        setProfilePhotoUrl(URL.createObjectURL(blob));
      } else {
        setProfilePhotoUrl(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể tải hồ sơ');
    }
  };

  const normalizeJoinCode = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.includes('/join/')) {
      return decodeURIComponent(trimmed.split('/join/')[1].split(/[?#]/)[0]).trim();
    }
    const url = trimmed.match(/[?&]join=([^&#]+)/i);
    return url ? decodeURIComponent(url[1]).trim() : trimmed;
  };

  const handleSearchExam = async () => {
    const code = normalizeJoinCode(joinCode);
    if (!code) {
      setJoinMessage('Vui lòng nhập mã cuộc thi hoặc đường link.');
      return;
    }
    setJoining(true);
    setJoinMessage(null);
    setSearchResult(null);
    try {
      const data = await studentApi.searchExam(code);
      setJoinCode(code);
      setSearchResult(data);
      setJoinMessage('Đã tìm thấy cuộc thi. Hãy kiểm tra thông tin trước khi vào thi.');
    } catch (e) {
      setJoinMessage(e instanceof Error ? e.message : 'Không tìm thấy cuộc thi');
    } finally {
      setJoining(false);
    }
  };

  const handleEnterFoundExam = async () => {
    if (!searchResult) return;
    if (!profile?.hasFacePhoto) {
      setView('profile');
      setError('Vui lòng cập nhật ảnh khuôn mặt trước khi bắt đầu thi.');
      return;
    }
    setJoining(true);
    setJoinMessage(null);
    try {
      const code = normalizeJoinCode(joinCode);
      await studentApi.joinExam(code);
      const session = {
        sessionId: searchResult.sessionId,
        examId: searchResult.examId,
        examCode: searchResult.examCode,
        examTitle: searchResult.examTitle,
        courseCode: searchResult.courseCode,
        courseName: searchResult.courseName,
        roomCode: searchResult.roomCode,
        startTime: searchResult.startTime,
        endTime: searchResult.endTime,
        sessionStatus: searchResult.sessionStatus,
        registrationStatus: 'registered',
        durationMinutes: searchResult.durationMinutes,
        questionCount: searchResult.totalQuestions,
        totalPoints: searchResult.totalPoints,
        attemptId: null,
        attemptStatus: null,
        score: null,
        canStart: true,
        requiresAccessCode: searchResult.requiresAccessCode,
      } satisfies StudentSession;
      await handleStart(session, code);
    } catch (e) {
      setJoinMessage(e instanceof Error ? e.message : 'Không thể vào cuộc thi');
    } finally {
      setJoining(false);
    }
  };

  const handleUploadFace = async (file: File) => {
    try {
      await studentApi.uploadPhoto(file);
      await loadProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể tải ảnh khuôn mặt');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể đăng xuất');
    }
  };

  const handleStart = async (session: StudentSession, suppliedRoomCode?: string) => {

    if (!profile?.hasFacePhoto) {
      setView('profile');
      setError('Vui lòng cập nhật ảnh khuôn mặt trước khi bắt đầu thi.');
      return;
    }

    const roomCode = suppliedRoomCode?.trim() || session.roomCode;
    const accessCode = session.requiresAccessCode
      ? window.prompt('Nhập mật khẩu ca thi do giảng viên cung cấp:')
      : undefined;
    if (accessCode === null) return;

    if (startLock.current) return;
    startLock.current = true;
    setStartingAi(true);
    setError(null);
    // M7: request fullscreen while the Start button still has user activation.
    await enterExamFullscreen();

    try {

      // Always use start: the backend also checks/restarts AI for a resumed attempt.
      const data = await studentApi.startExam(session.sessionId, roomCode, accessCode);

      setAttempt(data);
      attemptRef.current = data;

      setSelected(
        Object.fromEntries(
          data.questions
            .filter(q => q.selectedAnswerId)
            .map(q => [q.questionId, q.selectedAnswerId!]),
        ),
      );

      setViolationCount(0);
      setError(null);
      lastViolation.current = 0;
      autoSubmittingRef.current = false;
      fullscreenMonitoringArmed.current = Boolean(document.fullscreenElement);

      setView('exam');

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Không thể bắt đầu bài thi');
      if (view !== 'exam' && document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }
    } finally {
      startLock.current = false;
      setStartingAi(false);
    }

  };

  const handleViewResult = async (attemptId: number) => {

    try {

      const data = await studentApi.result(attemptId);

      setResult(data);

      setView('result-detail');

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Không thể tải kết quả');

    }

  };

  const handleChoose = async (questionId: number, answerId: number) => {

    if (!attempt) return;

    setSelected(prev => ({ ...prev, [questionId]: answerId }));

    setSavingQuestion(questionId);

    try {

      await studentApi.saveAnswer(attempt.attemptId, questionId, answerId);

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Không thể lưu đáp án');

    } finally {

      setSavingQuestion(null);

    }

  };

  async function handleSubmit(force = false) {

    if (!attempt) return;

    const answeredCount = Object.keys(selected).length;

    if (!force && answeredCount < attempt.questions.length) {

      const ok = window.confirm(`Bạn mới trả lời ${answeredCount}/${attempt.questions.length} câu. Vẫn nộp bài?`);

      if (!ok) return;

    } else if (!force && !window.confirm('Bạn chắc chắn muốn nộp bài?')) {

      return;

    }

    setSubmitting(true);

    try {

      const data = await studentApi.submit(

        attempt.attemptId,

        Object.entries(selected).map(([questionId, answerId]) => ({ questionId: Number(questionId), answerId }))

      );

      setResult(data);

      setAttempt(null);
      attemptRef.current = null;
      fullscreenMonitoringArmed.current = false;
      setViolationCount(0);
      autoSubmittingRef.current = false;

      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          // Ignore browser fullscreen exit errors after submission.
        }
      }

      await loadDashboard();

      setView('result-detail');

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Không thể nộp bài');

    } finally {

      setSubmitting(false);

    }

  }

  const remaining = useMemo(() => {

    if (!attempt) return null;

    const ms = Math.max(0, new Date(attempt.endTime).getTime() - now);

    const total = Math.floor(ms / 1000);

    const hh = Math.floor(total / 3600);

    const mm = Math.floor((total % 3600) / 60);

    const ss = total % 60;

    return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;

  }, [attempt, now]);

  useEffect(() => {
    if (!attempt || view !== 'exam' || submitting || autoSubmittingRef.current) return;
    const end = new Date(attempt.endTime).getTime();
    if (Number.isFinite(end) && end <= now) {
      autoSubmittingRef.current = true;
      setError('Thời gian làm bài đã kết thúc. Hệ thống đang nộp bài.');
      void handleSubmit(true);
    }
  }, [attempt, now, view, submitting]);

  if (!auth) return null;

  if (loading && !dashboard) {

    return <div className="min-h-screen grid place-items-center app-bg-main"><div className="text-sm font-semibold text-slate-500">Đang tải dữ liệu sinh viên...</div></div>;

  }

  return (

    <div className="min-h-screen app-bg-main text-slate-900">
      {startingAi && <div className="fixed inset-0 z-[100] bg-slate-950/70 flex items-center justify-center p-6" role="status" aria-live="polite"><div className="bg-white p-6 rounded-2xl max-w-md text-center shadow-xl"><RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3"/><h2 className="font-bold text-lg">Đang chuẩn bị bài thi và giám sát AI...</h2><p className="mt-2 text-sm text-slate-600">Nếu cuộc thi bật AI, hệ thống sẽ chờ model, camera và micro sẵn sàng. Lần tải đầu có thể mất khoảng 90 giây.</p></div></div>}

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">

        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

          <div className="flex items-center gap-3">

            <div className="w-10 h-10 rounded-xl text-white grid place-items-center" style={{ background: 'var(--primary)' }}>

              <GraduationCap className="w-5 h-5" />

            </div>

            <div>

              <div className="font-extrabold leading-tight">ExamFlow AI</div>

              <div className="text-[11px] text-slate-500">Cổng thi dành cho sinh viên</div>

            </div>

          </div>

          <div className="flex items-center gap-3">

            <div className="hidden sm:block text-right">

              <div className="text-sm font-bold">{auth.fullName}</div>

              <div className="text-[11px] text-slate-500">{auth.email}</div>

            </div>

            <button onClick={handleLogout} className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50" title="Đăng xuất">

              <LogOut className="w-4 h-4" />

            </button>

          </div>

        </div>

      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-[220px_1fr] gap-6">

        <aside className="bg-white border border-slate-200 rounded-2xl p-3 h-fit lg:sticky lg:top-24">

          {[

            { key: 'overview' as View, label: 'Tổng quan', Icon: BookOpenCheck },

            { key: 'results' as View, label: 'Kết quả', Icon: Trophy },

          ].map(({ key, label, Icon }) => (

            <button

              key={key}

              onClick={() => setView(key)}

              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${view === key ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`}

              style={view === key ? { background: 'var(--primary)' } : undefined}

            >

              <Icon className="w-4 h-4" /> {label}

            </button>

          ))}

          <div className="my-2 border-t border-slate-100" />

          <button
            onClick={() => setView('join')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold ${view === 'join' ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            style={view === 'join' ? { background: 'var(--primary)' } : undefined}
          >
            <QrCode className="w-4 h-4" /> Tham gia cuộc thi
          </button>

          <button
            onClick={() => { void loadProfile(); setView('profile'); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold ${view === 'profile' ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            style={view === 'profile' ? { background: 'var(--primary)' } : undefined}
          >
            <User className="w-4 h-4" /> Hồ sơ của tôi
          </button>

        </aside>

        <main className="min-w-0">

          {error && (

            <div className="mb-4 p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm flex items-center justify-between gap-3">

              <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</span>

              <button onClick={() => setError(null)} className="font-bold">×</button>

            </div>

          )}

          {view === 'overview' && dashboard && (

            <Overview dashboard={dashboard} onRefresh={loadDashboard} onViewResult={handleViewResult} />

          )}

          {view === 'results' && dashboard && (

            <Results results={dashboard.recentResults.length === dashboard.completedExams ? dashboard.recentResults : []} onViewResult={handleViewResult} loadAll={async () => {

              try {

                const all = await studentApi.results();

                setDashboard({ ...dashboard, recentResults: all });

              } catch (e) { setError(e instanceof Error ? e.message : 'Không thể tải kết quả'); }

            }} />

          )}

          {view === 'exam' && attempt && (
            <>
            <div role="status" className={`mb-4 p-4 rounded-xl border ${aiStatus?.ready ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
              <b>{aiStatus?.ready ? 'AI đang giám sát' : aiStatus?.status === 'disabled' ? 'Cuộc thi đã tắt giám sát AI' : aiStatus ? 'Giám sát AI bị gián đoạn' : 'Đang kiểm tra giám sát AI'}</b>
              <p className="text-sm mt-1">{aiStatus?.message || 'Đang kiểm tra kết nối...'}</p>
              {aiStatus?.required && !aiStatus.ready && <button disabled={startingAi} className="mt-2 px-3 py-2 rounded-lg border font-bold" onClick={() => void handleStart({ sessionId: attempt.sessionId, examCode: attempt.examCode } as StudentSession)}>Kết nối lại AI</button>}
              {aiStatus?.required && !aiStatus.ready && <p className="text-xs mt-2">Thời gian thi vẫn tiếp tục. Đáp án đã lưu được giữ lại; hãy báo admin nếu không kết nối lại được.</p>}
            </div>
            <ExamRunner
              attempt={attempt}
              selected={selected}
              remaining={remaining ?? '--:--:--'}
              savingQuestion={savingQuestion}
              onChoose={handleChoose}
              onSubmit={handleSubmit}
              submitting={submitting}
              violationCount={violationCount}
              fullscreenActive={fullscreenActive}
            />
            </>

          )}

          {view === 'join' && (
            <JoinExamView
              now={now}
              code={joinCode}
              setCode={setJoinCode}
              joining={joining}
              message={joinMessage}
              scannerOpen={scannerOpen}
              setScannerOpen={setScannerOpen}
              scannerError={scannerError}
              setScannerError={setScannerError}
              searchResult={searchResult}
              onSearch={handleSearchExam}
              onEnter={handleEnterFoundExam}
            />
          )}

          {view === 'profile' && (
            <ProfileView
              profile={profile}
              photoUrl={profilePhotoUrl}
              onUpload={handleUploadFace}
            />
          )}

          {view === 'result-detail' && result && (

            <ResultDetail result={result} onBack={() => setView('results')} />

          )}

        </main>

      </div>

    </div>

  );

};

const Overview = ({ dashboard, onRefresh, onViewResult }: { dashboard: StudentDashboard; onRefresh: () => void; onViewResult: (id: number) => void }) => (

  <div className="space-y-5">

    <div className="flex items-end justify-between gap-4">

      <div><h1 className="text-2xl font-extrabold">Xin chào, {dashboard.fullName}</h1><p className="text-sm text-slate-500 mt-1">Theo dõi ca thi, làm bài và xem kết quả của bạn.</p></div>

      <button onClick={onRefresh} className="p-2.5 border border-slate-200 rounded-xl bg-white hover:bg-slate-50"><RefreshCw className="w-4 h-4" /></button>

    </div>

    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">

      <Stat label="Ca thi sắp tới" value={dashboard.upcomingSessions} icon={CalendarClock} />

      <Stat label="Đang diễn ra" value={dashboard.ongoingSessions} icon={Clock3} />

      <Stat label="Đã hoàn thành" value={dashboard.completedExams} icon={CheckCircle2} />

      <Stat label="Điểm trung bình" value={dashboard.averageScore?.toFixed?.(2) ?? dashboard.averageScore} icon={Trophy} />

    </div>

    <Section title="Cuộc thi đã thi gần đây">

      <ResultList results={dashboard.recentResults} onViewResult={onViewResult} />

    </Section>

  </div>

);

const Results = ({ results, onViewResult, loadAll }: { results: StudentResult[]; onViewResult: (id: number) => void; loadAll: () => void }) => {

  useEffect(() => { void loadAll(); }, []);

  return <Section title="Kết quả thi"><ResultList results={results} onViewResult={onViewResult} /></Section>;

};

const Stat = ({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: React.ComponentType<{ className?: string }> }) => (

  <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4">

    <div className="w-11 h-11 rounded-xl grid place-items-center" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}><Icon className="w-5 h-5" /></div>

    <div><div className="text-2xl font-extrabold">{value}</div><div className="text-xs text-slate-500">{label}</div></div>

  </div>

);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (

  <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">

    <div className="px-5 py-4 border-b border-slate-100"><h2 className="font-extrabold">{title}</h2></div>

    <div className="p-4">{children}</div>

  </section>

);

const ResultList = ({ results, onViewResult }: { results: StudentResult[]; onViewResult: (id: number) => void }) => {

  if (!results.length) return <div className="py-8 text-center text-sm text-slate-500">Chưa có kết quả thi.</div>;

  return <div className="divide-y divide-slate-100">{results.map(r => (

    <button key={r.attemptId} onClick={() => onViewResult(r.attemptId)} className="w-full py-3 flex items-center justify-between gap-4 text-left hover:bg-slate-50 px-2 rounded-lg">

      <div><div className="font-bold text-sm">{r.examTitle}</div><div className="text-xs text-slate-500">{r.courseCode} · {fmt(r.submittedAt)} · {r.correctAnswers}/{r.totalQuestions} câu đúng</div></div>

      <div className="flex items-center gap-3"><span className="text-lg font-extrabold" style={{ color: 'var(--primary)' }}>{r.score}/{r.totalPoints}</span><ChevronRight className="w-4 h-4 text-slate-400" /></div>

    </button>

  ))}</div>;

};

const JoinExamView = ({
  now,
  code,
  setCode,
  joining,
  message,
  scannerOpen,
  setScannerOpen,
  scannerError,
  setScannerError,
  searchResult,
  onSearch,
  onEnter,
}: {
  now: number;
  code: string;
  setCode: (v: string) => void;
  joining: boolean;
  message: string | null;
  scannerOpen: boolean;
  setScannerOpen: (v: boolean) => void;
  scannerError: string | null;
  setScannerError: (v: string | null) => void;
  searchResult: ExamSearchResult | null;
  onSearch: () => void;
  onEnter: () => void;
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!scannerOpen) return;
    let stream: MediaStream | null = null;
    let timer = 0;

    const start = async () => {
      try {
        const Detector = (window as unknown as { BarcodeDetector?: new (o?: { formats?: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
        if (!Detector) {
          setScannerError('Trình duyệt này chưa hỗ trợ quét QR trực tiếp. Bạn có thể dán đường link QR hoặc nhập mã.');
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new Detector({ formats: ['qr_code'] });
        const scan = async () => {
          if (!videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            const value = results[0]?.rawValue;
            if (value) {
              setCode(value);
              setScannerOpen(false);
              return;
            }
          } catch {
            // A QR code may be unreadable in this frame; retry on the next scan.
          }
          timer = window.setTimeout(() => void scan(), 500);
        };
        void scan();
      } catch (e) {
        setScannerError(e instanceof Error ? e.message : 'Không thể mở camera quét QR');
      }
    };
    void start();
    return () => {
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [scannerOpen]);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Tham gia cuộc thi</h1>
        <p className="text-sm text-slate-500 mt-1">Nhập mã do giảng viên cung cấp, dán đường link hoặc quét QR.</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <label className="text-sm font-bold">Mã ca thi hoặc đường link</label>
        <div className="flex gap-2">
          <input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSearch(); }} placeholder="VD: EXAM-439CC267" className="flex-1 px-4 py-3 rounded-xl border border-slate-200 outline-none focus:border-blue-500" />
          <button onClick={onSearch} disabled={joining} className="px-5 py-3 rounded-xl text-white font-bold disabled:opacity-50" style={{ background: 'var(--primary)' }}>{joining ? 'Đang tìm...' : 'Tìm kiếm'}</button>
        </div>
        <button onClick={() => { setScannerError(null); setScannerOpen(true); }} className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold hover:bg-slate-50 inline-flex items-center justify-center gap-2"><QrCode className="w-5 h-5" /> Quét QR bằng camera</button>
        {message && <div className={`p-3 rounded-xl text-sm font-semibold ${searchResult ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{message}</div>}
        {scannerError && <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm">{scannerError}</div>}
      </div>
      {searchResult && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-slate-500">{searchResult.courseCode} · {searchResult.examCode}</div>
              <h2 className="text-xl font-extrabold mt-1">{searchResult.examTitle}</h2>
              <p className="text-sm text-slate-500 mt-1">{searchResult.sessionName || 'Ca thi'}</p>
            </div>
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${searchResult.canEnter ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{searchResult.canEnter ? (searchResult.alreadyAttempted ? 'Đang làm dở' : 'Đang mở') : (new Date(searchResult.startTime).getTime() > now ? 'Chưa mở' : 'Đã đóng')}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <InfoRow label="Phòng thi" value={searchResult.roomCode} />
            <InfoRow label="Số câu" value={String(searchResult.totalQuestions)} />
            <InfoRow label="Thời lượng" value={`${searchResult.durationMinutes} phút`} />
            <InfoRow label="Tổng điểm" value={String(searchResult.totalPoints)} />
            <InfoRow label="Bắt đầu" value={fmt(searchResult.startTime)} />
            <InfoRow label="Kết thúc" value={fmt(searchResult.endTime)} />
          </div>
          <div className="flex justify-end">
            <button onClick={onEnter} disabled={joining || !searchResult.canEnter || searchResult.alreadyAttempted && searchResult.attemptStatus !== 'in_progress'} className="px-5 py-3 rounded-xl text-white font-bold disabled:opacity-50" style={{ background: 'var(--primary)' }}>
              {joining ? 'Đang chuẩn bị...' : 'Vào thi'}
            </button>
          </div>
        </div>
      )}

      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4">
          <div className="bg-white rounded-2xl p-4 w-full max-w-md space-y-3">
            <div className="flex items-center justify-between"><b>Quét mã QR</b><button onClick={() => setScannerOpen(false)}><X /></button></div>
            <video ref={videoRef} className="w-full rounded-xl bg-black aspect-square object-cover" muted playsInline />
            <p className="text-xs text-slate-500">Đưa mã QR của cuộc thi vào giữa khung hình.</p>
          </div>
        </div>
      )}
    </div>
  );
};

const ProfileView = ({ profile, photoUrl, onUpload }: {
  profile: import('../services/studentService').StudentProfile | null;
  photoUrl: string | null;
  onUpload: (file: File) => void;
}) => (
  <div className="max-w-3xl space-y-5">
    <div><h1 className="text-2xl font-extrabold">Hồ sơ của tôi</h1><p className="text-sm text-slate-500 mt-1">Ảnh khuôn mặt được dùng làm ảnh tham chiếu cho hệ thống nhận diện khi thi.</p></div>
    <div className="bg-white border border-slate-200 rounded-2xl p-6 grid md:grid-cols-[180px_1fr] gap-6 items-start">
      <div className="space-y-3">
        <div className="w-40 h-40 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 grid place-items-center">
          {photoUrl ? <img src={photoUrl} alt="Ảnh khuôn mặt" className="w-full h-full object-cover" /> : <User className="w-16 h-16 text-slate-300" />}
        </div>
        <label className="cursor-pointer w-full px-3 py-2.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2" style={{ background: 'var(--primary)' }}>
          <Upload className="w-4 h-4" /> {profile?.hasFacePhoto ? 'Đổi ảnh' : 'Thêm ảnh'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) onUpload(file); }} />
        </label>
      </div>
      <div className="space-y-4 text-sm">
        <InfoRow label="Họ và tên" value={profile?.fullName ?? 'Đang tải...'} />
        <InfoRow label="Tài khoản" value={profile?.username ?? '—'} />
        <InfoRow label="Email" value={profile?.email ?? '—'} />
        <InfoRow label="Khoa / ngành" value={profile?.department ?? '—'} />
        <div className={`p-3 rounded-xl flex items-center gap-2 font-semibold ${profile?.hasFacePhoto ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {profile?.hasFacePhoto ? <ProfileCheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {profile?.hasFacePhoto ? 'Đã có ảnh tham chiếu khuôn mặt' : 'Chưa có ảnh khuôn mặt - cần cập nhật trước khi thi'}
        </div>
      </div>
    </div>
  </div>
);

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-1 border-b border-slate-100 pb-3"><span className="text-xs text-slate-500">{label}</span><span className="font-bold">{value}</span></div>
);

const ExamRunner = ({
  attempt,
  selected,
  remaining,
  savingQuestion,
  onChoose,
  onSubmit,
  submitting,
  violationCount,
  fullscreenActive,
}: {
  attempt: StudentAttempt;
  selected: Record<number, number>;
  remaining: string;
  savingQuestion: number | null;
  onChoose: (q: number, a: number) => void;
  onSubmit: () => void;
  submitting: boolean;
  violationCount: number;
  fullscreenActive: boolean;
}) => (

  <div className="space-y-4">

    {violationCount > 0 && (
      <div className={`px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-3 ${
        violationCount >= 3
          ? 'border-rose-300 bg-rose-50 text-rose-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'
      }`}>
        <span>
          {violationCount >= 3
            ? 'M7: Vi phạm lần 3/3 - Hệ thống đang nộp bài'
            : `M7: Cảnh báo - Vi phạm lần ${violationCount}/3. Vui lòng quay lại môi trường thi.`}
        </span>
        <span>{violationCount}/3</span>
      </div>
    )}

    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-20 z-20">

      <div><div className="text-xs font-bold text-slate-500">{attempt.courseCode}</div><h1 className="text-xl font-extrabold">{attempt.examTitle}</h1><div className="text-xs text-slate-500 mt-1">Đã trả lời {Object.keys(selected).length}/{attempt.questions.length} câu</div></div>

      <div className="flex items-center gap-3"><div className={`px-3 py-2 rounded-xl font-mono font-bold ${fullscreenActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`} title={fullscreenActive ? 'Đang ở chế độ toàn màn hình' : 'Đã thoát toàn màn hình'}><span className="mr-2 text-xs font-sans">{fullscreenActive ? 'FULLSCREEN' : 'FULLSCREEN OFF'}</span><Clock3 className="inline w-4 h-4 mr-1" />{remaining}</div><button disabled={submitting} onClick={onSubmit} className="px-4 py-2.5 rounded-xl text-white font-bold disabled:opacity-60" style={{ background: 'var(--primary)' }}>{submitting ? 'Đang nộp...' : 'Nộp bài'}</button></div>

    </div>

    {attempt.questions.map(q => (

      <div key={q.questionId} className="bg-white border border-slate-200 rounded-2xl p-5">

        <div className="flex items-center justify-between gap-3 mb-3"><span className="text-xs font-extrabold" style={{ color: 'var(--primary)' }}>Câu {q.position}</span><span className="text-xs text-slate-500">{q.points} điểm {q.cloCode ? `· ${q.cloCode}` : ''}</span></div>

        <p className="font-semibold leading-relaxed">{q.content}</p>

        <div className="mt-4 grid gap-2">{q.options.map(opt => {

          const active = selected[q.questionId] === opt.id;

          return <button key={opt.id} onClick={() => void onChoose(q.questionId, opt.id)} className={`text-left px-4 py-3 rounded-xl border transition-all ${active ? 'border-transparent text-white' : 'border-slate-200 hover:border-slate-300 bg-white'}`} style={active ? { background: 'var(--primary)' } : undefined}><span className="font-extrabold mr-2">{opt.label}.</span>{opt.content}{savingQuestion === q.questionId && active ? <span className="ml-2 text-[10px] opacity-80">đang lưu...</span> : null}</button>;

        })}</div>

      </div>

    ))}

  </div>

);

const ResultDetail = ({ result, onBack }: { result: StudentResult; onBack: () => void }) => (

  <div className="space-y-5">

    <button onClick={onBack} className="text-sm font-bold text-slate-500 hover:text-slate-800">← Quay lại kết quả</button>

    <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center">

      <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center mb-3" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}><Trophy className="w-7 h-7" /></div>

      <h1 className="text-xl font-extrabold">{result.examTitle}</h1>

      <p className="text-sm text-slate-500 mt-1">{result.courseCode} · Nộp lúc {fmt(result.submittedAt)}</p>

      <div className="text-5xl font-black mt-5" style={{ color: 'var(--primary)' }}>{result.score}<span className="text-xl text-slate-400">/{result.totalPoints}</span></div>

      <div className="text-sm text-slate-600 mt-2">Đúng {result.correctAnswers}/{result.totalQuestions} câu</div>

    </div>

    <Section title="Mức độ đạt CLO">

      <div className="space-y-4">{result.cloAchievement.length ? result.cloAchievement.map(c => (

        <div key={c.cloId}><div className="flex items-center justify-between text-sm mb-1.5"><div><span className="font-extrabold">{c.cloCode}</span><span className="text-slate-500 ml-2">{c.description}</span></div><span className="font-bold">{c.achievementPercent}%</span></div><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, c.achievementPercent)}%`, background: 'var(--primary)' }} /></div></div>

      )) : <div className="text-sm text-slate-500">Chưa có dữ liệu CLO cho bài thi này.</div>}</div>

    </Section>

  </div>

);
