import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  GraduationCap,
  LogOut,
  PlayCircle,
  RefreshCw,
  Trophy,
  BookOpenCheck,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { clearAuthSession, getAuthSession } from '../../services/authService';
import {
  studentApi,
  type StudentDashboard,
  type StudentSession,
  type StudentAttempt,
  type StudentResult,
} from '../../services/studentService';
import { ROUTES } from '../../constants/routes';

type View = 'overview' | 'sessions' | 'results' | 'exam' | 'result-detail';

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
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!auth || auth.role !== 'student') {
      navigate(ROUTES.LOGIN, { replace: true });
      return;
    }
    void loadDashboard();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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

  const handleLogout = () => {
    clearAuthSession();
    navigate(ROUTES.LOGIN, { replace: true });
  };

  const handleStart = async (session: StudentSession) => {
    try {
      let accessCode: string | undefined;
      if (session.requiresAccessCode) {
        const entered = window.prompt(`Nhập mã truy cập cho phòng ${session.roomCode}`);
        if (!entered) return;
        accessCode = entered;
      }
      const data = session.attemptId && session.attemptStatus === 'in_progress'
        ? await studentApi.getAttempt(session.attemptId)
        : await studentApi.startExam(session.sessionId, accessCode);
      setAttempt(data);
      setSelected(Object.fromEntries(data.questions.filter(q => q.selectedAnswerId).map(q => [q.questionId, q.selectedAnswerId!])))
      setView('exam');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể bắt đầu bài thi');
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

  const handleSubmit = async () => {
    if (!attempt) return;
    const answeredCount = Object.keys(selected).length;
    if (answeredCount < attempt.questions.length) {
      const ok = window.confirm(`Bạn mới trả lời ${answeredCount}/${attempt.questions.length} câu. Vẫn nộp bài?`);
      if (!ok) return;
    } else if (!window.confirm('Bạn chắc chắn muốn nộp bài?')) {
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
      await loadDashboard();
      setView('result-detail');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể nộp bài');
    } finally {
      setSubmitting(false);
    }
  };

  const remaining = useMemo(() => {
    if (!attempt) return null;
    const ms = Math.max(0, new Date(attempt.endTime).getTime() - now);
    const total = Math.floor(ms / 1000);
    const hh = Math.floor(total / 3600);
    const mm = Math.floor((total % 3600) / 60);
    const ss = total % 60;
    return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
  }, [attempt, now]);

  if (!auth) return null;

  if (loading && !dashboard) {
    return <div className="min-h-screen grid place-items-center app-bg-main"><div className="text-sm font-semibold text-slate-500">Đang tải dữ liệu sinh viên...</div></div>;
  }

  return (
    <div className="min-h-screen app-bg-main text-slate-900">
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
            { key: 'sessions' as View, label: 'Ca thi của tôi', Icon: CalendarClock },
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
        </aside>

        <main className="min-w-0">
          {error && (
            <div className="mb-4 p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm flex items-center justify-between gap-3">
              <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</span>
              <button onClick={() => setError(null)} className="font-bold">×</button>
            </div>
          )}

          {view === 'overview' && dashboard && (
            <Overview dashboard={dashboard} onRefresh={loadDashboard} onStart={handleStart} onViewResult={handleViewResult} />
          )}

          {view === 'sessions' && dashboard && (
            <Sessions sessions={dashboard.sessions} onStart={handleStart} onViewResult={handleViewResult} />
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
            <ExamRunner attempt={attempt} selected={selected} remaining={remaining ?? '--:--:--'} savingQuestion={savingQuestion} onChoose={handleChoose} onSubmit={handleSubmit} submitting={submitting} />
          )}

          {view === 'result-detail' && result && (
            <ResultDetail result={result} onBack={() => setView('results')} />
          )}
        </main>
      </div>
    </div>
  );
};

const Overview = ({ dashboard, onRefresh, onStart, onViewResult }: { dashboard: StudentDashboard; onRefresh: () => void; onStart: (s: StudentSession) => void; onViewResult: (id: number) => void }) => (
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
    <Section title="Ca thi gần đây">
      <SessionList sessions={dashboard.sessions.slice(0, 5)} onStart={onStart} onViewResult={onViewResult} />
    </Section>
    <Section title="Kết quả gần đây">
      <ResultList results={dashboard.recentResults} onViewResult={onViewResult} />
    </Section>
  </div>
);

const Sessions = ({ sessions, onStart, onViewResult }: { sessions: StudentSession[]; onStart: (s: StudentSession) => void; onViewResult: (id: number) => void }) => (
  <Section title="Tất cả ca thi của tôi"><SessionList sessions={sessions} onStart={onStart} onViewResult={onViewResult} /></Section>
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

const SessionList = ({ sessions, onStart, onViewResult }: { sessions: StudentSession[]; onStart: (s: StudentSession) => void; onViewResult: (id: number) => void }) => {
  if (!sessions.length) return <div className="py-8 text-center text-sm text-slate-500">Chưa có ca thi nào được phân cho bạn.</div>;
  return <div className="space-y-3">{sessions.map(s => (
    <div key={s.sessionId} className="border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4 justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{s.examTitle}</span><span className="text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-bold">{s.courseCode}</span></div>
        <div className="text-xs text-slate-500 mt-1">{fmt(s.startTime)} → {fmt(s.endTime)} · Phòng {s.roomCode} · {s.questionCount} câu</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {s.attemptId && s.attemptStatus === 'completed' ? (
          <button onClick={() => onViewResult(s.attemptId!)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold hover:bg-slate-50">Xem kết quả</button>
        ) : (
          <button disabled={!s.canStart && s.attemptStatus !== 'in_progress'} onClick={() => onStart(s)} className="px-3 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: 'var(--primary)' }}>
            <span className="inline-flex items-center gap-1.5"><PlayCircle className="w-4 h-4" />{s.attemptStatus === 'in_progress' ? 'Tiếp tục' : 'Bắt đầu'}</span>
          </button>
        )}
      </div>
    </div>
  ))}</div>;
};

const ResultList = ({ results, onViewResult }: { results: StudentResult[]; onViewResult: (id: number) => void }) => {
  if (!results.length) return <div className="py-8 text-center text-sm text-slate-500">Chưa có kết quả thi.</div>;
  return <div className="divide-y divide-slate-100">{results.map(r => (
    <button key={r.attemptId} onClick={() => onViewResult(r.attemptId)} className="w-full py-3 flex items-center justify-between gap-4 text-left hover:bg-slate-50 px-2 rounded-lg">
      <div><div className="font-bold text-sm">{r.examTitle}</div><div className="text-xs text-slate-500">{r.courseCode} · {fmt(r.submittedAt)} · {r.correctAnswers}/{r.totalQuestions} câu đúng</div></div>
      <div className="flex items-center gap-3"><span className="text-lg font-extrabold" style={{ color: 'var(--primary)' }}>{r.score}/{r.totalPoints}</span><ChevronRight className="w-4 h-4 text-slate-400" /></div>
    </button>
  ))}</div>;
};

const ExamRunner = ({ attempt, selected, remaining, savingQuestion, onChoose, onSubmit, submitting }: {
  attempt: StudentAttempt; selected: Record<number, number>; remaining: string; savingQuestion: number | null;
  onChoose: (q: number, a: number) => void; onSubmit: () => void; submitting: boolean;
}) => (
  <div className="space-y-4">
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-20 z-20">
      <div><div className="text-xs font-bold text-slate-500">{attempt.courseCode}</div><h1 className="text-xl font-extrabold">{attempt.examTitle}</h1><div className="text-xs text-slate-500 mt-1">Đã trả lời {Object.keys(selected).length}/{attempt.questions.length} câu</div></div>
      <div className="flex items-center gap-3"><div className="px-3 py-2 rounded-xl bg-amber-50 text-amber-700 font-mono font-bold"><Clock3 className="inline w-4 h-4 mr-1" />{remaining}</div><button disabled={submitting} onClick={onSubmit} className="px-4 py-2.5 rounded-xl text-white font-bold disabled:opacity-60" style={{ background: 'var(--primary)' }}>{submitting ? 'Đang nộp...' : 'Nộp bài'}</button></div>
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
