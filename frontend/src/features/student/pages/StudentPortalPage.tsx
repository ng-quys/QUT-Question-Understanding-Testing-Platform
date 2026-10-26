import {ExamPerformance} from '../components/ExamPerformance';
import {recordExamRender} from '../services/examPerformance';
import { OfflineEvidence } from '../components/OfflineEvidence';
import { OfflineExam, offlineExamStore, ExamClock, reconcileOfflineRecord,submitOrRecoverResult } from '../services/offlineExam';
import { examCamera } from '../services/examCamera';
import { CameraPreflight } from '../components/CameraPreflight';
import { monitorExamBrowser } from '../services/examBrowserMonitor';
import { AttemptRecovery, indexedDraftStore, type RecoveryState } from '../services/attemptRecovery';
import { AttemptSyncNotice } from '../components/AttemptSyncNotice';
import { ExamConnection, type ExamConnectionPhase } from '../services/examConnection';
import { examDate } from '@shared/utils/examTime';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import {
  AlertCircle,
  RefreshCw,
  X
} from 'lucide-react';

import { getAuthSession, logout } from '@shared/features/auth/services/authService';
import { loadStudentPhoto } from '../services/studentPhotoService';

import {
  studentApi,
  type StudentAttempt,
  type StudentDashboard,
  type StudentResult,
  type StudentSession,
} from '../services/studentService';

import { ROUTES } from '@shared/app/routes';
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
  const recoveryRef = useRef<AttemptRecovery | null>(null);
  const [recoveryState,setRecoveryState]=useState<RecoveryState>({pending:[],localSaving:false,storageError:false,syncing:false,syncError:false});
  const [monitorUnavailable,setMonitorUnavailable]=useState(false);
  const [connectionPhase,setConnectionPhase]=useState<ExamConnectionPhase>('active');
  const [cameraCheck,setCameraCheck]=useState<{sessionId:number;session?:StudentSession;mode:'start'|'restore'}|null>(null);
  const [cameraBlocked,setCameraBlocked]=useState(false);
  const [monitoringRevision,setMonitoringRevision]=useState(0);
  const [cameraMessage,setCameraMessage]=useState('');
  const cameraBlockedRef=useRef(false);
  const offlineExamRef=useRef<OfflineExam|null>(null);
  const examClockRef=useRef<ExamClock|null>(null);
  const [submissionPending,setSubmissionPending]=useState(false);
  const connectionRef=useRef<ExamConnection|null>(null);
  const retryConnectionRef=useRef<()=>void>(()=>{});
  const [recoveryNotice,setRecoveryNotice]=useState('');
  const owner=auth?.username?.trim().toLowerCase()||'';
  const recoveryStateRef=useRef(recoveryState);
  recoveryStateRef.current=recoveryState;
  const applyRecoveryState=useCallback((state:RecoveryState)=>{
    const sameIds=(a:number[],b:number[])=>a.length===b.length&&a.every((id,index)=>id===b[index]);
    setRecoveryState(previous=>previous.localSaving===state.localSaving&&previous.storageError===state.storageError&&previous.syncing===state.syncing&&previous.syncError===state.syncError&&sameIds(previous.pending,state.pending)?previous:state);
    const pending=state.syncing?state.pending:[];
    setPendingQuestions(previous=>sameIds(previous,pending)?previous:pending);
    if(state.syncError&&!cameraBlockedRef.current)connectionRef.current?.disconnect();
  },[]);
  useEffect(()=>()=>{recoveryRef.current?.stop();},[owner]);
  useEffect(()=>{
    if(!owner||auth?.role!=='student')return;
    let disposed=false;
    void offlineExamStore.list(owner).then(async records=>{
      const cached=records.filter(row=>row.owner===owner&&row.grant?.token&&row.attempt?.questions?.length).sort((a,b)=>b.savedAt-a.savedAt)[0];
      if(!cached||disposed||attemptRef.current)return;
      const drafts=await indexedDraftStore.list(owner,cached.attempt.attemptId).catch(()=>[]);
      if(disposed||attemptRef.current)return;
      const record=reconcileOfflineRecord(cached,drafts);
      examClockRef.current=new ExamClock(Math.max(Date.now()+record.clockOffset,record.savedAt));
      const journal=new OfflineExam(record,offlineExamStore,()=>examClockRef.current!.now());
      const recovery=new AttemptRecovery({owner,attempt:record.attempt,deadline:Date.parse(record.grant.deadline),
        online:()=>navigator.onLine!==false&&connectionRef.current?.phase==='active',
        clock:()=>examClockRef.current!.now(),send:(questionId,answerId)=>studentApi.saveAnswer(record.attempt.attemptId,questionId,answerId),
        onChange:state=>{if(recoveryRef.current!==recovery)return;applyRecoveryState(state);}});
      recoveryRef.current=recovery;
      const restored=await recovery.restore();
      if(disposed||attemptRef.current){recovery.stop();if(recoveryRef.current===recovery)recoveryRef.current=null;return;}
      for(const [question,answer] of Object.entries(record.selected)){
        if(!record.frozen&&restored.selected[Number(question)]!==answer)recovery.choose(Number(question),answer,record.answerTimes?.[Number(question)]??examClockRef.current.now());
      }
      await journal.save().catch(()=>{});
      if(disposed||attemptRef.current){recovery.stop();if(recoveryRef.current===recovery)recoveryRef.current=null;return;}
      offlineExamRef.current=journal;
      selectedRef.current={...record.selected};setSelected(selectedRef.current);
      attemptRef.current=record.attempt;setAttempt(record.attempt);setNow(examClockRef.current.now());setSubmissionPending(Boolean(record.frozen));
      autoSubmittingRef.current=false;setView('exam');setLoading(false);setError(null);
    }).catch(()=>{});
    return()=>{disposed=true;};
  },[owner]);
  useEffect(()=>{
    if(!attempt)return;
    const connection=new ExamConnection({
      online:()=>navigator.onLine!==false,
      probe:async()=>{const clock=await studentApi.clock();serverOffset.current=Date.parse(clock.serverTime)-Date.now();},
      onChange:setConnectionPhase,automaticRecovery:true,
      onDisconnect:()=>{
        offlineExamRef.current?.disconnected();
      },
    });
    connectionRef.current=connection;
    const retry=async()=>{
      if(!await connection.check())return;
      if(offlineExamRef.current?.record.frozen||autoSubmittingRef.current)void handleSubmit(true);
      else void recoveryRef.current?.flush();
    };
    retryConnectionRef.current=()=>{void retry();};
    const offline=()=>connection.disconnect();
    const beforeUnload=(event:BeforeUnloadEvent)=>{
      if(offlineExamRef.current?.record.frozen||recoveryStateRef.current.pending.length||recoveryStateRef.current.localSaving||recoveryStateRef.current.storageError){
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
  const browserEventQueue = useRef<Promise<unknown>>(Promise.resolve());
  const fullscreenMonitoringArmed = useRef(false);

  const handleCameraGate=useCallback((blocked:boolean,message:string)=>{
    const changed=cameraBlockedRef.current!==blocked;
    cameraBlockedRef.current=blocked;setCameraBlocked(blocked);setCameraMessage(message);
    if(changed)recoveryRef.current?.setMonitoringBlocked(blocked);
  },[]);

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

    // Preserve start/restore ordering even when a student returns to fullscreen quickly.
    browserEventQueue.current=browserEventQueue.current.catch(()=>{}).then(()=>studentApi.browserEvent(
      currentAttempt.attemptId,
      event,
      active,
      AbortSignal.timeout(6000),
    )).catch(() => {
      // Keep local monitoring active if the backend is temporarily unavailable.
    });
  };

  const recordViolation = (type: BrowserViolation) => {
    if(!fullscreenMonitoringArmed.current||connectionRef.current?.phase!=='active'||navigator.onLine===false)return;
    const currentTime = Date.now();
    // Record fullscreen transitions independently of the UI warning cooldown.
    if(type==='FULLSCREEN_EXIT')sendM7Event(type,true);

    if (
      currentTime - lastViolation.current
      < M7_VIOLATION_COOLDOWN_MS
    ) {
      return;
    }

    lastViolation.current = currentTime;

    console.warn('M7 VIOLATION:', type);
    if(type!=='FULLSCREEN_EXIT')sendM7Event(type, true);

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

    // Tab/window monitoring remains active even if fullscreen was initially denied.
    fullscreenMonitoringArmed.current = true;
    return monitorExamBrowser({
      onFullscreen:setFullscreenActive,
      onViolation:recordViolation,
      onRestore:type=>sendM7Event(type,false),
    });
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

    const timer = window.setInterval(() => setNow(examClockRef.current?.now()??Date.now()+serverOffset.current), 1000);

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

      if(!attemptRef.current)setError(e instanceof Error ? e.message : 'Không thể tải dữ liệu sinh viên');

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

  const handleStart = async (session: StudentSession, verificationToken?:string|null,checked=false) => {
    if(attemptRef.current){
      if(attemptRef.current.sessionId===session.sessionId)setView('exam');
      else setError('Vui lòng hoàn tất lượt thi đang làm trước khi vào ca khác.');
      return;
    }

    if(!checked){setCameraCheck({sessionId:session.sessionId,session,mode:'start'});return;}

    if (startLock.current) return;
    startLock.current = true;
    setStartingAi(true);
    setError(null);
    // M7: request fullscreen while the Start button still has user activation.
    await enterExamFullscreen();

    try {

      // Always use start: the backend also checks/restarts AI for a resumed attempt.
      const data = await studentApi.startExam(session.sessionId,undefined,undefined,verificationToken);
      const grant=await studentApi.offlineGrant(data.attemptId);
      examClockRef.current=new ExamClock(Date.parse(grant.serverTime));
      setNow(examClockRef.current.now());

      const reconnecting = recoveryRef.current?.attemptId === data.attemptId;
      if (!reconnecting) {
        recoveryRef.current?.stop();
        const recovery=new AttemptRecovery({owner,attempt:data,deadline:examDate(data.endTime).getTime(),
          online:()=>navigator.onLine!==false&&connectionRef.current?.phase==='active',
          clock:()=>examClockRef.current?.now()??Date.now()+serverOffset.current,
          send:(questionId,answerId)=>studentApi.saveAnswer(data.attemptId,questionId,answerId),
          onChange:state=>{if(recoveryRef.current!==recovery)return;applyRecoveryState(state);}
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
        fullscreenMonitoringArmed.current = true;
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      const journal=OfflineExam.create(owner,data,grant,selectedRef.current,undefined,()=>examClockRef.current!.now());
      await journal.save();offlineExamRef.current=journal;setSubmissionPending(false);
      setAttempt(data);
      attemptRef.current = data;
      handleCameraGate(false,'');
      setConnectionPhase('active');
      setView('exam');
      void recoveryRef.current?.flush();

    } catch (e) {

      examCamera.discardIdle();
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

  const handleChoose = useCallback((questionId: number, answerId: number) => {
    if (!attempt || cameraBlockedRef.current || offlineExamRef.current?.record.frozen||submitting || submitLock.current) return;
    const changedAt=examClockRef.current?.now()??Date.now()+serverOffset.current;
    if(!recoveryRef.current?.choose(questionId,answerId,changedAt)||!offlineExamRef.current?.choose(questionId,answerId,changedAt))return;
    selectedRef.current = { ...selectedRef.current, [questionId]: answerId };
    setSelected(selectedRef.current);
  },[attempt,submitting]);

  async function handleSubmit(force = false) {

    const current=attemptRef.current,journal=offlineExamRef.current;
    if (!current || !journal || submitLock.current) return;

    if (!force) {
      if(cameraBlockedRef.current&&!journal.record.frozen){setError('Hãy khôi phục camera trước khi nộp bài.');return;}
      if(journal.record.frozen){void handleSubmit(true);return;}
      setSubmitConfirm(true);
      return;
    }
    setSubmitConfirm(false);
    submitLock.current = true;
    setSubmitting(true);

    try {
      setSubmissionPending(true);
      const frozen=await journal.freeze();
      await recoveryRef.current?.prepareSubmit();
      if(navigator.onLine===false){journal.disconnected();setError(null);return;}
      const {data,recovered}=await submitOrRecoverResult(current.attemptId,
        ()=>studentApi.offlineSubmit(current.attemptId,frozen),
        ()=>studentApi.result(current.attemptId,AbortSignal.timeout(10000)));

      // Clear local answers only after the server confirms submission (also safe after a lost response).
      try{await recoveryRef.current?.complete();}catch{ /* server result is authoritative; terminal attempts cannot restore a draft */ }
      await journal.complete().catch(()=>{});offlineExamRef.current=null;setSubmissionPending(false);
      recoveryRef.current=null;setRecoveryNotice(recovered?'Máy chủ xác nhận lượt thi đã được nộp. Đã khôi phục kết quả; bản lưu trên máy không ghi đè lên bài đã nộp.':'');
      setResult(data);

      setAttempt(null);
      attemptRef.current = null;setCameraCheck(null);handleCameraGate(false,'');
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

      offlineExamRef.current?.disconnected();
      void connectionRef.current?.check();
      setError(navigator.onLine===false?null:e instanceof Error?e.message:'Chưa gửi được bài. Bản đã khóa vẫn được giữ trên máy để thử lại.');

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
      setError(null);
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
    <StudentShell name={profile?.fullName||auth.fullName} studentCode={profile?.username||auth.username} view={view} onNavigate={navigateView} onLogout={() => void handleLogout()}>

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
      {attempt&&submissionPending&&<section className="student-notice warning" role="status" style={{marginBottom:16}}><div><strong>{now>=examDate(attempt.endTime).getTime()?'Đã hết giờ · Đang chờ xác nhận nộp bài':'Bài làm đã khóa · Đang chờ nộp'}</strong><p>{(recoveryState.storageError||offlineExamRef.current?.storageError)?'Chưa lưu được bản dự phòng. Giữ trang này mở và báo giám thị để được hỗ trợ.':'Đáp án đã được khóa và lưu trên máy. Hệ thống sẽ tự nộp khi kết nối được máy chủ.'}</p></div><button className="student-button secondary" disabled={submitting} onClick={()=>retryConnectionRef.current()}>Thử kết nối lại</button></section>}
      {error && (!attempt||connectionPhase==='active') && <div role="alert" className="student-notice error" style={{ marginBottom: 20 }}>
        <AlertCircle size={18} />
        <span>
          {error}
        </span>
        <button aria-label="Đóng thông báo" onClick={() => setError(null)}>
          <X size={16} />
        </button>
      </div>}

      {loading && !dashboard && !attempt ? <div role="status" aria-label="Đang tải dữ liệu sinh viên">
        <div className="student-skeleton" />
        <div className="student-skeleton hero" />
        <div className="student-skeleton-grid">
          {[0, 1, 2, 3].map(i => <div className="student-skeleton" key={i} />)}
        </div>
      </div> : !dashboard&&!attempt ? <div className="student-error-page">
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
        {view === 'overview' && <Overview dashboard={dashboard!} profile={profile} loading={loading} onRefresh={loadDashboard} onViewResult={handleViewResult} onJoin={() => navigateView('join')} onProfile={() => navigateView('profile')} />}
        {resultsOpened&&<div hidden={view!=='results'} style={view!=='results'?{display:'none'}:undefined}><Results onViewResult={handleViewResult} loadResults={studentApi.results} refreshKey={dashboard?.completedExams} /></div>}
        {view === 'exam' && attempt && <>
          <AttemptSyncNotice state={{...recoveryState,storageError:recoveryState.storageError||Boolean(offlineExamRef.current?.storageError)}} online={connectionPhase==='active'} expired={now>=examDate(attempt.endTime).getTime()} onRetry={()=>void recoveryRef.current?.flush()}/>
          {!submissionPending&&<StudentMonitoring key={`${attempt.attemptId}-${monitoringRevision}`} attemptId={attempt.attemptId} required={offlineExamRef.current?.record.grant.cameraRequired} onUnavailable={setMonitorUnavailable} onCameraGate={handleCameraGate}/>}
          {cameraBlocked&&<section className="student-camera-lock" role="alert"><h2>Tạm khóa làm bài để kiểm tra camera</h2><p>{cameraMessage||'Hãy bật camera, giữ một khuôn mặt rõ ràng và khớp ảnh hồ sơ để tiếp tục thi.'}</p><strong>Thời gian còn lại: {remaining??'--:--:--'}</strong><p>Đáp án đã chọn được giữ lại. Thời gian thi vẫn tiếp tục chạy.</p><button type="button" className="student-button primary" disabled={submitting||now>=examDate(attempt.endTime).getTime()} onClick={()=>setCameraCheck({sessionId:attempt.sessionId,mode:'restore'})}>Kiểm tra lại camera</button></section>}
          {import.meta.env.DEV&&<ExamPerformance/>}
          <React.Profiler id="student-exam" onRender={recordExamRender}><div hidden={cameraBlocked} style={cameraBlocked?{display:'none'}:undefined}><ExamRunner key={attempt.attemptId} attempt={attempt} selected={selected} remaining={remaining ?? '--:--:--'} savingQuestion={savingQuestion} onChoose={handleChoose} onSubmit={() => void handleSubmit()} submitting={submitting} expired={submissionPending||now>=examDate(attempt.endTime).getTime()} violationCount={violationCount} fullscreenActive={fullscreenActive} onFullscreen={() => void enterExamFullscreen()} /></div></React.Profiler>
        </>}
        {(view === 'join'||view === 'sessions') && <AssignedExams sessions={dashboard?.sessions??[]} busy={startingAi} onStart={handleStart} onRefresh={loadDashboard} onViewResults={()=>navigateView('results')}/>}
        {view === 'profile' && <ProfileView profile={profile} photoUrl={profilePhotoUrl} onUpload={handleUploadFace} />}
        {view === 'result-detail' && result && <ResultDetail result={result} onBack={() => navigateView('results')} />}
      </>}

    {cameraCheck&&<CameraPreflight clockOffsetMs={serverOffset.current} sessionId={cameraCheck.sessionId} hasPhoto={Boolean(profile?.hasFacePhoto)} onClose={()=>setCameraCheck(null)} onProfile={()=>{setCameraCheck(null);setView('profile');}} onReady={async token=>{
      const target=cameraCheck;
      if(target.mode==='restore'){
        const current=attemptRef.current;if(!current)throw new Error('Không tìm thấy lượt thi đang làm.');
        await studentApi.restoreCamera(current.attemptId,token);setMonitoringRevision(value=>value+1);handleCameraGate(false,'');setCameraCheck(null);
      }else{
        setCameraCheck(null);
        if(target.session)await handleStart(target.session,token,true);
      }
    }}/>}
      <OfflineEvidence owner={owner} attempt={attempt?.attemptId??null} grant={offlineExamRef.current?.record.grant} capturing={Boolean(attempt&&!submissionPending&&now<Date.parse(offlineExamRef.current?.record.grant.deadline??''))} unavailable={connectionPhase!=='active'||monitorUnavailable} deferUpload={Boolean(attempt&&(submissionPending||submitting))} clock={()=>examClockRef.current?.now()??Date.now()+serverOffset.current}/>
    </StudentShell>
  );
};
