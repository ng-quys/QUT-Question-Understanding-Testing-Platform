import { AttemptRecovery, indexedDraftStore, type RecoveryState } from '../services/attemptRecovery';
import { AttemptSyncNotice } from '../components/AttemptSyncNotice';
import { ExamConnection, type ExamConnectionPhase } from '../services/examConnection';
import { ExamConnectionScreen } from '../components/ExamConnectionScreen';
import { examDate } from '../../../utils/examTime';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import {
  AlertCircle,
  RefreshCw,
  X
} from 'lucide-react';

import { getAuthSession, logout } from '../../auth/services/authService';
import { loadStudentPhoto } from '../services/studentPhotoService';

import {
  studentApi,
  type StudentAttempt,
  type StudentDashboard,
  type StudentResult,
  type StudentSession,
} from '../services/studentService';

import { ROUTES } from '../../../app/routes';
import { StudentMonitoring } from '../components/StudentMonitoring';
import { AssignedExams } from '../components/AssignedExams';
import { ExamRunner, Overview, ProfileView, ResultDetail, Results, StudentDialog, StudentShell, type StudentView } from '../components/StudentWorkspace';

type View = StudentView;

export const StudentPortalPage: React.FC = () => {

  const navigate = useNavigate();

  const auth = getAuthSession();

  const [view, setView] = useState<View>('overview');

  const [dashboard, setDashboard] = useState<StudentDashboard | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState<StudentAttempt | null>(null);

  const [result, setResult] = useState<StudentResult | null>(null);
  const [resultsOpened,setResultsOpened]=useState(false);
  const resultsScroll=useRef(0);
  const resultRequest=useRef(0);

  const [selected, setSelected] = useState<Record<number, number>>({});
  const selectedRef = useRef<Record<number, number>>({});

  const [pendingQuestions, setPendingQuestions] = useState<number[]>([]);
  const savingQuestion = pendingQuestions.length ? pendingQuestions[pendingQuestions.length - 1] : null;
  const submitLock = useRef(false);
  const [failedQuestions, setFailedQuestions] = useState<number[]>([]);
  const recoveryRef = useRef<AttemptRecovery | null>(null);
  const [recoveryState,setRecoveryState]=useState<RecoveryState>({pending:[],localSaving:false,storageError:false,syncing:false,syncError:false});
  const [connectionPhase,setConnectionPhase]=useState<ExamConnectionPhase>('active');
  const [connectionError,setConnectionError]=useState<string|null>(null);
  const connectionRef=useRef<ExamConnection|null>(null);
  const retryConnectionRef=useRef<()=>void>(()=>{});
  const [recoveryNotice,setRecoveryNotice]=useState('');
  const owner=auth?.username?.trim().toLowerCase()||'';
  const recoveryStateRef=useRef(recoveryState);
  recoveryStateRef.current=recoveryState;
  useEffect(()=>()=>{recoveryRef.current?.stop();},[owner]);
  useEffect(()=>{
    if(!attempt)return;
    const connection=new ExamConnection({
      online:()=>navigator.onLine!==false,
      probe:async()=>{const clock=await studentApi.clock();serverOffset.current=Date.parse(clock.serverTime)-Date.now();},
      onChange:setConnectionPhase,
      onDisconnect:()=>{
        fullscreenMonitoringArmed.current=false;
        setSubmitConfirm(false);setError(null);setView('overview');
      },
    });
    connectionRef.current=connection;
    const retry=async()=>{
      if(!await connection.check())return;
      if(autoSubmittingRef.current)void handleSubmit(true);
      else void recoveryRef.current?.flush();
    };
    retryConnectionRef.current=()=>{void retry();};
    const offline=()=>connection.disconnect();
    const beforeUnload=(event:BeforeUnloadEvent)=>{
      if(recoveryStateRef.current.localSaving||(recoveryStateRef.current.storageError&&recoveryStateRef.current.pending.length)){
        event.preventDefault();event.returnValue='';
      }
    };
    window.addEventListener('online',retry);window.addEventListener('offline',offline);
    window.addEventListener('beforeunload',beforeUnload);
    if(navigator.onLine===false)offline();
    const timer=window.setInterval(()=>void retry(),5000);
    return()=>{connection.stop();if(connectionRef.current===connection)connectionRef.current=null;window.clearInterval(timer);window.removeEventListener('online',retry);window.removeEventListener('offline',offline);window.removeEventListener('beforeunload',beforeUnload);};
  },[attempt?.attemptId]);

  const [submitting, setSubmitting] = useState(false);

  const serverOffset=useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const [violationCount, setViolationCount] = useState(0);
  const [profile, setProfile] = useState<import('../services/studentService').StudentProfile | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [startingAi, setStartingAi] = useState(false);
  const startLock = useRef(false);
  const [submitConfirm, setSubmitConfirm] = useState(false);
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
    if(!fullscreenMonitoringArmed.current||connectionRef.current?.phase!=='active'||navigator.onLine===false)return;
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

    const timer = window.setInterval(() => setNow(Date.now()+serverOffset.current), 1000);

    return () => window.clearInterval(timer);

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

      const [data,clock] = await Promise.all([studentApi.dashboard(),studentApi.clock()]);
      serverOffset.current=Date.parse(clock.serverTime)-Date.now();

      setDashboard(data);

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Không thể tải dữ liệu sinh viên');

    } finally {

      setLoading(false);

    }

  };

  useEffect(()=>{
    if(view==='exam'||attempt)return;
    let active=true;let timer:ReturnType<typeof setTimeout>;let controller:AbortController;
    const poll=async()=>{if(!active)return;if(document.hidden){timer=setTimeout(poll,8000);return;}controller=new AbortController();
      try{const [data,clock]=await Promise.all([studentApi.dashboard(AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])),studentApi.clock()]);if(active){setDashboard(data);serverOffset.current=Date.parse(clock.serverTime)-Date.now();}}
      catch(e){if(active)setError(e instanceof Error?e.message:'Không cập nhật được danh sách thi');}
      finally{if(active)timer=setTimeout(poll,8000);}
    };timer=setTimeout(poll,8000);return()=>{active=false;clearTimeout(timer);controller?.abort();};
  },[view,attempt?.attemptId]);

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

  const handleUploadFace = async (file: File) => {
    try {
      await studentApi.uploadPhoto(file);
      await loadProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể tải ảnh khuôn mặt');
      throw e;
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể đăng xuất');
    }
  };

  const handleStart = async (session: StudentSession) => {
    if(attemptRef.current){
      if(attemptRef.current.sessionId===session.sessionId)await handleResume();
      else setError('Vui lòng hoàn tất lượt thi đang làm trước khi vào ca khác.');
      return;
    }

    if (!profile?.hasFacePhoto) {
      setView('profile');
      setError('Vui lòng cập nhật ảnh khuôn mặt trước khi bắt đầu thi.');
      return;
    }

    if (startLock.current) return;
    startLock.current = true;
    setStartingAi(true);
    setError(null);
    // M7: request fullscreen while the Start button still has user activation.
    await enterExamFullscreen();

    try {

      // Always use start: the backend also checks/restarts AI for a resumed attempt.
      const data = await studentApi.startExam(session.sessionId);

      const reconnecting = recoveryRef.current?.attemptId === data.attemptId;
      if (!reconnecting) {
        recoveryRef.current?.stop();
        const recovery=new AttemptRecovery({owner,attempt:data,deadline:examDate(data.endTime).getTime(),
          clock:()=>Date.now()+serverOffset.current,
          send:(questionId,answerId)=>studentApi.saveAnswer(data.attemptId,questionId,answerId),
          onChange:state=>{if(recoveryRef.current!==recovery)return;setRecoveryState(state);setFailedQuestions(state.pending);setPendingQuestions(state.syncing?state.pending:[]);if(state.syncError)connectionRef.current?.disconnect();}
        });
        recoveryRef.current=recovery;
        const restored=await recovery.restore();
        selectedRef.current = restored.selected;
        setSelected(restored.selected);
        setRecoveryNotice('');

        setViolationCount(0);
        setError(null);
        lastViolation.current = 0;
        autoSubmittingRef.current = false;
        fullscreenMonitoringArmed.current = Boolean(document.fullscreenElement);
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      setAttempt(data);
      attemptRef.current = data;
      setConnectionPhase('active');setConnectionError(null);
      setView('exam');
      void recoveryRef.current?.flush();

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Không thể bắt đầu bài thi');
      if (view !== 'exam' && document.fullscreenElement) {
        await document.exitFullscreen().catch(() => { });
      }
    } finally {
      startLock.current = false;
      setStartingAi(false);
    }

  };

  const handleViewResult = async (attemptId: number, cached?: StudentResult) => {
    const requestId=++resultRequest.current;
    resultsScroll.current=view==='results'?window.scrollY:0;
    setError(null);

    try {

      const data = cached?.attemptId===attemptId ? cached : await studentApi.result(attemptId);
      if(resultRequest.current!==requestId)return;
      // Also handles a successful submission whose HTTP response was lost before a reload.
      void indexedDraftStore.clear(owner,attemptId).catch(()=>{});

      setResult(data);

      setView('result-detail');
      requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'instant'}));

    } catch (e) {

      if(resultRequest.current===requestId)setError(e instanceof Error ? e.message : 'Không thể tải kết quả');

    }

  };

  const handleChoose = (questionId: number, answerId: number) => {
    if (!attempt || connectionRef.current?.phase!=='active'||navigator.onLine===false||submitting || submitLock.current || !recoveryRef.current?.choose(questionId,answerId)) return;
    selectedRef.current = { ...selectedRef.current, [questionId]: answerId };
    setSelected(selectedRef.current);
  };

  async function handleResume(){
    const current=attemptRef.current,connection=connectionRef.current;
    if(!current||!connection||connection.phase!=='ready')return;
    if(autoSubmittingRef.current||examDate(current.endTime).getTime()<=Date.now()+serverOffset.current){
      autoSubmittingRef.current=true;void handleSubmit(true);return;
    }
    setConnectionError(null);
    // Keep the browser's user activation for requesting fullscreen.
    await enterExamFullscreen();
    try{
      let verified:StudentAttempt|undefined;
      const resumed=await connection.resume(async()=>{
        const data=await studentApi.startExam(current.sessionId);
        if(data.attemptId!==current.attemptId||data.status!=='in_progress')throw new Error('Lượt thi không còn được phép tiếp tục.');
        if(examDate(data.endTime).getTime()<=Date.now()+serverOffset.current)throw new Error('Đã hết giờ làm bài.');
        verified=data;
      });
      if(!resumed||!verified)return;
      setAttempt(verified);attemptRef.current=verified;
      fullscreenMonitoringArmed.current=Boolean(document.fullscreenElement);
      setError(null);setView('exam');
      void recoveryRef.current?.flush();
    }catch(e){setConnectionError(e instanceof Error?e.message:'Chưa thể mở lại bài thi. Vui lòng thử lại.');}
  }

  async function handleSubmit(force = false) {

    if (!attempt || submitLock.current) return;

    if (!force) {
      setSubmitConfirm(true);
      return;
    }
    setSubmitConfirm(false);
    submitLock.current = true;
    setSubmitting(true);

    try {
      await recoveryRef.current?.prepareSubmit();
      if(navigator.onLine===false)throw new Error('Đang mất mạng, chưa thể nộp bài. Bài làm được giữ trên máy này; hãy kết nối lại để gửi bài.');
      const lateCount=examDate(attempt.endTime).getTime()<=Date.now()+serverOffset.current?recoveryStateRef.current.pending.length:0;
      const data = await studentApi.submit(

        attempt.attemptId,

        Object.entries(selectedRef.current).map(([questionId, answerId]) => ({ questionId: Number(questionId), answerId }))

      );

      // Clear local answers only after the server confirms submission (also safe after a lost response).
      try{await recoveryRef.current?.complete();}catch{ /* server result is authoritative; terminal attempts cannot restore a draft */ }
      recoveryRef.current=null;
      setRecoveryNotice(lateCount?`Đã nộp bài. Có ${lateCount} đáp án chưa được xác nhận đồng bộ trước giờ kết thúc; kết quả chỉ tính dữ liệu máy chủ đã nhận.`:'');
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

      void loadDashboard();

      setView('result-detail');
      requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'instant'}));

    } catch (e) {

      recoveryRef.current?.resume();
      void connectionRef.current?.check();
      setError(e instanceof Error ? e.message : 'Chưa nộp được bài. Dữ liệu lưu tạm vẫn được giữ để thử lại.');

    } finally {

      submitLock.current = false;
      setSubmitting(false);

    }

  }

  const remaining = useMemo(() => {

    if (!attempt) return null;

    const ms = Math.max(0, examDate(attempt.endTime).getTime() - now);

    const total = Math.floor(ms / 1000);

    const hh = Math.floor(total / 3600);

    const mm = Math.floor((total % 3600) / 60);

    const ss = total % 60;

    return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;

  }, [attempt, now]);

  useEffect(() => {
    if (!attempt || submitting || autoSubmittingRef.current) return;
    const end = examDate(attempt.endTime).getTime();
    if (Number.isFinite(end) && end <= now) {
      autoSubmittingRef.current = true;
      setError('Thời gian làm bài đã kết thúc. Hệ thống đang nộp bài.');
      void handleSubmit(true);
    }
  }, [attempt, now, view, submitting]);

  if (!auth) return null;

  const navigateView = (next: View) => {
    if (view === 'exam') return;
    resultRequest.current++;
    if(next==='results')setResultsOpened(true);
    if (next === 'profile') void loadProfile();
    setError(null);
    setView(next);
    const top=next==='results'&&view==='result-detail'?resultsScroll.current:0;
    requestAnimationFrame(()=>window.scrollTo({top,behavior:'instant'}));
  };

  return (
    <StudentShell name={auth.fullName} email={auth.email} view={view} onNavigate={navigateView} onLogout={() => void handleLogout()}>

      {submitConfirm && attempt && <StudentDialog title="Nộp bài thi?" description={`Bạn đã chọn ${Object.keys(selected).length}/${attempt.questions.length} câu. ${Object.keys(selected).length < attempt.questions.length ? 'Vẫn còn câu chưa trả lời. ' : ''}Sau khi nộp, bạn không thể thay đổi đáp án.`} onClose={() => setSubmitConfirm(false)}>
        <div className="student-dialog-actions">
          <button className="student-button secondary" onClick={() => setSubmitConfirm(false)}>
            Tiếp tục làm bài
          </button>
          <button className="student-button primary" onClick={() => void handleSubmit(true)}>
            Xác nhận nộp bài
          </button>
        </div>
      </StudentDialog>}

      {recoveryNotice&&<div className="student-notice warning" role="status" style={{marginBottom:16}}><span>{recoveryNotice}</span><button aria-label="Đóng thông báo khôi phục" onClick={()=>setRecoveryNotice('')}><X size={16}/></button></div>}
      {attempt&&connectionPhase!=='active'&&<ExamConnectionScreen phase={connectionPhase} remaining={remaining??'--:--:--'} expired={now>=examDate(attempt.endTime).getTime()} error={connectionError} storageError={recoveryState.storageError} onRetry={()=>retryConnectionRef.current()} onResume={()=>void handleResume()}/>}
      {error && (!attempt||connectionPhase==='active') && <div role="alert" className="student-notice error" style={{ marginBottom: 20 }}>
        <AlertCircle size={18} />
        <span>
          {error}
        </span>
        <button aria-label="Đóng thông báo" onClick={() => setError(null)}>
          <X size={16} />
        </button>
      </div>}

      {loading && !dashboard ? <div role="status" aria-label="Đang tải dữ liệu sinh viên">
        <div className="student-skeleton" />
        <div className="student-skeleton hero" />
        <div className="student-skeleton-grid">
          {[0, 1, 2, 3].map(i => <div className="student-skeleton" key={i} />)}
        </div>
      </div> : !dashboard ? <div className="student-error-page">
        <AlertCircle size={30} className="mx-auto" />
        <h1>
          Chưa thể tải không gian học tập
        </h1>
        <p>
          Kiểm tra kết nối và thử tải lại dữ liệu.
        </p>
        <button className="student-button primary" onClick={() => void loadDashboard()}>
          <RefreshCw size={16} />
          Thử lại
        </button>
      </div> : <>
        {view === 'overview' && <Overview dashboard={dashboard} profile={profile} loading={loading} onRefresh={loadDashboard} onViewResult={handleViewResult} onJoin={() => navigateView('join')} onProfile={() => navigateView('profile')} />}
        {resultsOpened&&<div hidden={view!=='results'} style={view!=='results'?{display:'none'}:undefined}><Results onViewResult={handleViewResult} loadResults={studentApi.results} refreshKey={dashboard?.completedExams} /></div>}
        {view === 'exam' && attempt && connectionPhase==='active' && <>
          <AttemptSyncNotice state={recoveryState} online={true} expired={now>=examDate(attempt.endTime).getTime()} onRetry={()=>void recoveryRef.current?.flush()}/>
          <ExamRunner key={attempt.attemptId} monitoring={<StudentMonitoring key={attempt.attemptId} attemptId={attempt.attemptId}/>} attempt={attempt} selected={selected} remaining={remaining ?? '--:--:--'} savingQuestion={savingQuestion} pendingQuestions={pendingQuestions} failedQuestions={failedQuestions} onChoose={handleChoose} onSubmit={() => void handleSubmit()} submitting={submitting} expired={now>=examDate(attempt.endTime).getTime()} violationCount={violationCount} fullscreenActive={fullscreenActive} onFullscreen={() => void enterExamFullscreen()} />
        </>}
        {(view === 'join'||view === 'sessions') && <AssignedExams sessions={dashboard.sessions} busy={startingAi} onStart={handleStart} onRefresh={loadDashboard} onViewResults={()=>navigateView('results')}/>}
        {view === 'profile' && <ProfileView profile={profile} photoUrl={profilePhotoUrl} onUpload={handleUploadFace} />}
        {view === 'result-detail' && result && <ResultDetail result={result} onBack={() => navigateView('results')} />}
      </>}

    </StudentShell>
  );
};
