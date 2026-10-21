import { examDate } from '../../../utils/examTime';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, Clock3, Flag, GraduationCap, LayoutDashboard, Loader2, LogOut, Maximize2, PanelLeftClose, PanelLeftOpen, QrCode, RefreshCw, Search, ShieldCheck, Trophy, Upload, User, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { StudentAttempt, StudentDashboard, StudentProfile, StudentResult } from '../services/studentService';
import '../styles/student.css';

export type StudentView = 'overview' | 'sessions' | 'results' | 'profile' | 'join' | 'exam' | 'result-detail';
const date = (value: string) => examDate(value).toLocaleString('vi-VN', { timeZone:'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
const initials = (name: string) => name.trim().split(/\s+/).slice(-2).map(s => s[0]).join('').toUpperCase();

export function StudentDialog({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="student-dialog" aria-labelledby="student-dialog-title" aria-describedby="student-dialog-description" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="student-dialog-icon">
      <ShieldCheck size={26} />
    </div>
    <h2 id="student-dialog-title">
      {title}
    </h2>
    <p id="student-dialog-description">
      {description}
    </p>
    {children}
  </dialog>;
}

export function StudentShell({ name, email, view, onNavigate, onLogout, children }: { name: string; email: string; view: StudentView; onNavigate: (view: StudentView) => void; onLogout: () => void; children: ReactNode }) {
  const exam = view === 'exam';
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('examflow.student.sidebarCollapsed') === 'true'; }
    catch { return false; }
  });
  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try { localStorage.setItem('examflow.student.sidebarCollapsed', String(next)); }
    catch { /* Keep navigation usable if browser storage is blocked. */ }
  }
  const items = [{ view: 'overview', label: 'Tổng quan', icon: LayoutDashboard }, { view: 'join', label: 'Kỳ thi của tôi', icon: BookOpen }, { view: 'results', label: 'Kết quả học tập', icon: Trophy }, { view: 'profile', label: 'Hồ sơ của tôi', icon: User }] as const;
  return <div className={`student-workspace ${exam ? 'student-focus' : sidebarCollapsed ? 'student-sidebar-collapsed' : ''}`}>

    <a href="#student-main" className="student-skip">
      Đến nội dung chính
    </a>

    <header className="student-header">
      <div className="student-header-inner">

        <a href="#" onClick={e => { e.preventDefault(); if(!exam) onNavigate('overview'); }} className="student-brand" aria-label="ExamFlow — Trang sinh viên">
          <span className="student-brand-icon">
            <GraduationCap size={23} />
          </span>
          <span>{"ExamFlow "}<span className="student-brand-tag">
              KHÔNG GIAN SINH VIÊN
            </span>
          </span>
        </a>

        <div className="student-header-right">
          {exam ? <span className="student-badge">
            <ShieldCheck size={15} />{" Phiên làm bài"}</span> : <span className="student-header-date">
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          </span>}
          <span className="student-avatar">
            {initials(name)}
          </span>
          <div className="student-header-user">
            <strong>
              {name}
            </strong>
            <span>
              {email}
            </span>
          </div>
          {!exam && <button className="student-icon-button" onClick={onLogout} aria-label="Đăng xuất" title="Đăng xuất">
            <LogOut size={18} />
          </button>}
        </div>

      </div>
    </header>

    <div className="student-layout">

      {!exam && <aside id="student-sidebar" className="student-sidebar" aria-label="Menu sinh viên">
        <div className="student-sidebar-heading"><div className="student-sidebar-label">
          KHÔNG GIAN CỦA BẠN
        </div><button className="student-sidebar-toggle" aria-controls="student-sidebar" aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'} title={sidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'} onClick={toggleSidebar}>
          {sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
        </button></div>
        <nav aria-label="Điều hướng sinh viên">
          {items.map(item => <button key={item.view} aria-label={item.label} title={item.label} aria-current={view === item.view || item.view === 'results' && view === 'result-detail' ? 'page' : undefined} className={`student-nav-item ${view === item.view || item.view === 'results' && view === 'result-detail' ? 'active' : ''}`} onClick={() => onNavigate(item.view)}>
            <item.icon size={19} />
            <span>
              {item.label}
            </span>
            <ChevronRight size={15} />
          </button>)}
        </nav>
        <div className="student-sidebar-note">
          <ShieldCheck size={24} />
          <strong>
            Sẵn sàng cho mỗi kỳ thi
          </strong>
          <p>
            Cập nhật ảnh hồ sơ và kiểm tra kết nối trước khi bắt đầu.
          </p>
          <button onClick={() => onNavigate('profile')}>{"Kiểm tra hồ sơ "}<ArrowRight size={14} />
          </button>
        </div>
        <div className="student-sidebar-footer">
          ExamFlow · Học tập & đánh giá
        </div>
      </aside>}

      <main id="student-main" className="student-main" tabIndex={-1}>
        {children}
      </main>

    </div>

  </div>;
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="student-page-heading">
    <div>
      <div className="student-eyebrow">
        {eyebrow}
      </div>
      <h1>
        {title}
      </h1>
      <p>
        {description}
      </p>
    </div>
    {action}
  </div>;
}

export function EmptyState({ icon = <BookOpen size={26} />, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="student-empty">
    <span>
      {icon}
    </span>
    <h3>
      {title}
    </h3>
    <p>
      {description}
    </p>
    {action}
  </div>;
}

export function Overview({ dashboard, profile, loading, onRefresh, onViewResult, onJoin, onProfile }: { dashboard: StudentDashboard; profile: StudentProfile | null; loading: boolean; onRefresh: () => void; onViewResult: (id: number, result?: StudentResult) => void; onJoin: () => void; onProfile: () => void }) {
  return <div className="student-stack">
    <PageHeading eyebrow="TỔNG QUAN HỌC TẬP" title={`Xin chào, ${dashboard.fullName.split(' ').slice(-2).join(' ')}!`} description="Một nơi để theo dõi kỳ thi và hành trình học tập của bạn." action={<button onClick={onRefresh} disabled={loading} className="student-button secondary">
      <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />{" Làm mới"}</button>} />

    <section className="student-hero">
      <div>
        <span className="student-hero-eyebrow">
          <span />{" TỰ TIN CHO KỲ THI TIẾP THEO"}</span>
        <h2>{"Sẵn sàng thể hiện "}<br />{" kiến thức của bạn?"}</h2>
        <p>
          Xem các kỳ thi được nhà trường phân công. Ca thi xuất hiện khi đến giờ mở thi.
        </p>
        <button className="student-button hero-button" onClick={onJoin}>{"Kỳ thi của tôi "}<ArrowRight size={18} />
        </button>
      </div>
      <div className="student-hero-art" aria-hidden="true">
        <div className="student-orbit orbit-one" />
        <div className="student-orbit orbit-two" />
        <div className="student-art-card">
          <GraduationCap size={40} />
          <span>
            HỌC TẬP. TIẾN BỘ.
          </span>
          <div className="student-art-line" />
          <div className="student-art-line short" />
          <span className="student-art-check">
            <Check size={20} />
          </span>
        </div>
        <span className="student-art-spark">
          ✦
        </span>
      </div>
    </section>

    <div className="student-stats student-stats-personal">
      {[{ label: 'Bài thi đã hoàn thành', value: dashboard.completedExams, icon: CheckCircle2, color: 'purple' }, { label: 'Điểm trung bình', value: dashboard.completedExams ? Number(dashboard.averageScore).toFixed(2) : '—', icon: Trophy, color: 'amber' }].map(stat => <div className="student-stat" key={stat.label}>
        <span className={`student-stat-icon ${stat.color}`}>
          <stat.icon size={21} />
        </span>
        <div>
          <span>
            {stat.label}
          </span>
          <strong>
            {stat.value}
          </strong>
        </div>
      </div>)}
    </div>

    <div className="student-overview-columns">
      <div className="student-stack">
        <section className="student-panel">
          <div className="student-section-heading">
            <div>
              <h2>
                Kết quả gần đây
              </h2>
              <p>
                Nhìn lại những bài thi bạn đã hoàn thành.
              </p>
            </div>
          </div>
          <ResultList results={dashboard.recentResults} onViewResult={onViewResult} />
        </section>
      </div>

      <div className="student-stack">
        <section className="student-panel student-readiness">
          <span className={`student-stat-icon ${profile?.hasFacePhoto ? 'green' : 'amber'}`}>
            <ShieldCheck size={22} />
          </span>
          <h2>
            Chuẩn bị trước khi thi
          </h2>
          <p>
            Một vài bước nhỏ để buổi thi diễn ra suôn sẻ.
          </p>
          <div className="student-checklist">
            <div>
              <CheckCircle2 size={18} />
              <span>
                Đăng nhập tài khoản sinh viên
              </span>
            </div>
            <div className={profile?.hasFacePhoto ? '' : 'pending'}>
              {profile?.hasFacePhoto ? <CheckCircle2 size={18} /> : <User size={18} />}
              <span>
                {profile?.hasFacePhoto ? 'Đã cập nhật ảnh tham chiếu' : 'Cần cập nhật ảnh khuôn mặt'}
              </span>
            </div>
            <div className="neutral">
              <ShieldCheck size={18} />
              <span>
                Kiểm tra camera, micro và mạng trước khi vào thi
              </span>
            </div>
          </div>
          <button onClick={onProfile} className="student-button secondary">
            {profile?.hasFacePhoto ? 'Xem hồ sơ của tôi' : 'Cập nhật ảnh ngay'}
            <ArrowRight size={15} />
          </button>
        </section>
        <div className="student-tip">
          <BookOpen size={20} />
          <div>
            <strong>
              Một chút chuẩn bị, thêm phần tự tin
            </strong>
            <p>
              Chọn không gian yên tĩnh, đọc kỹ hướng dẫn và theo dõi thời gian khi làm bài.
            </p>
          </div>
        </div>
      </div>
    </div>

  </div>;
}

export function ResultList({ results, onViewResult }: { results: StudentResult[]; onViewResult: (id: number, result?: StudentResult) => void }) {
  if(!results.length) return <EmptyState icon={<Trophy size={26} />} title="Hành trình của bạn bắt đầu từ đây" description="Kết quả sẽ xuất hiện sau khi bạn hoàn thành bài thi." />;
  return <div className="student-result-list">
    {results.map(result => <button key={result.attemptId} className="student-result-row" onClick={() => onViewResult(result.attemptId, result)}>
      <span className="student-result-icon">
        <BookOpen size={20} />
      </span>
      <span className="student-result-info">
        <strong>
          {result.examTitle}
        </strong>
        <span>
          {result.courseCode}{" · "}{date(result.submittedAt)}
        </span>
        <span>
          {result.correctAnswers}
          /
          {result.totalQuestions}{" câu đúng"}</span>
      </span>
      <span className="student-result-score">
        <strong>
          {result.score}
          <small>
            /
            {result.totalPoints}
          </small>
        </strong>
        <span>{"Xem chi tiết "}<ChevronRight size={13} />
        </span>
      </span>
    </button>)}
  </div>;
}

export function Results({ onViewResult, loadResults, refreshKey }: { onViewResult: (id: number, result?: StudentResult) => void; loadResults: () => Promise<StudentResult[]>; refreshKey?: number }) {
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [reload, setReload] = useState(0);
  const hasResults=useRef(false);
  useEffect(() => { let active = true; setLoading(!hasResults.current); setError(''); loadResults().then(data => { if(active) {setResults(data);hasResults.current=true;} }).catch(() => { if(active) setError('Không thể tải kết quả. Vui lòng thử lại.'); }).finally(() => { if(active) setLoading(false); }); return () => { active = false; }; }, [loadResults, reload, refreshKey]);
  const filtered = results.filter(r => `${r.examTitle} ${r.courseCode} ${r.courseName}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))).sort((a, b) => sort === 'score' ? (b.score / (b.totalPoints || 1)) - (a.score / (a.totalPoints || 1)) : new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  return <div className="student-stack">
    <PageHeading eyebrow="KẾT QUẢ HỌC TẬP" title="Mỗi bài thi, một bước tiến" description="Xem điểm số và mức độ đạt chuẩn đầu ra của từng bài thi." />
    <section className="student-panel">
      <div className="student-results-toolbar">
        <label className="student-search">
          <Search size={18} />
          <input aria-label="Tìm kết quả theo tên bài thi hoặc môn học" placeholder="Tìm bài thi, môn học..." value={query} onChange={e => setQuery(e.target.value)} />
        </label>
        <select aria-label="Sắp xếp kết quả" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="newest">
            Mới nhất
          </option>
          <option value="score">
            Tỷ lệ điểm cao nhất
          </option>
        </select>
        <button className="student-button secondary" disabled={loading} aria-label="Làm mới kết quả" onClick={()=>setReload(v=>v+1)}><RefreshCw size={16}/></button>
        <span className="student-count">
          {filtered.length}{" bài thi"}</span>
      </div>
      {error&&results.length>0&&<p className="student-question-save failed" role="status">Chưa cập nhật được kết quả mới. Bạn vẫn có thể xem dữ liệu đã tải.</p>}
      {loading ? <div className="student-loading" role="status">
        <Loader2 className="animate-spin" />{" Đang tải kết quả..."}</div> : error && !results.length ? <EmptyState icon={<AlertTriangle size={26} />} title="Chưa tải được dữ liệu" description={error} action={<button className="student-button secondary" onClick={() => setReload(v => v + 1)}>
        Thử lại
      </button>} /> : query && !filtered.length ? <EmptyState icon={<Search size={26} />} title="Không tìm thấy bài thi" description="Thử tìm theo tên môn học hoặc một từ khóa khác." action={<button className="student-text-button" onClick={() => setQuery('')}>
        Xóa tìm kiếm
      </button>} /> : <ResultList results={filtered} onViewResult={onViewResult} />}
    </section>
  </div>;
}

export function ProfileView({ profile, photoUrl, onUpload }: { profile: StudentProfile | null; photoUrl: string | null; onUpload: (file: File) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const upload = async (file?: File) => { if(!file) return; setFailed(false); setMessage(''); if(!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setFailed(true); setMessage('Chọn ảnh JPG, PNG hoặc WebP, tối đa 5 MB.'); return; } setBusy(true); try { await onUpload(file); setMessage('Ảnh tham chiếu đã được cập nhật.'); } catch (cause) { setFailed(true); setMessage(cause instanceof Error ? cause.message : 'Không thể cập nhật ảnh. Vui lòng thử lại.'); } finally { setBusy(false); } };
  return <div className="student-stack">
    <PageHeading eyebrow="HỒ SƠ SINH VIÊN" title="Hồ sơ của tôi" description="Thông tin cá nhân và ảnh tham chiếu để xác minh khi tham gia thi." />
    <div className="student-profile-grid">
      <section className="student-panel student-profile-photo">
        <div className="student-photo">
          {photoUrl ? <img src={photoUrl} alt={`Ảnh tham chiếu của ${profile?.fullName || 'sinh viên'}`} /> : <User size={64} />}
        </div>
        <h2>
          {profile?.fullName || 'Đang tải hồ sơ...'}
        </h2>
        <span className={`student-badge ${profile?.hasFacePhoto ? 'green' : 'amber'}`}>
          {profile?.hasFacePhoto ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}

          {profile?.hasFacePhoto ? 'Đã có ảnh tham chiếu' : 'Chưa có ảnh tham chiếu'}
        </span>
        <label className={`student-button primary student-upload ${busy ? 'busy' : ''}`}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} />}

          {busy ? 'Đang cập nhật...' : profile?.hasFacePhoto ? 'Thay đổi ảnh' : 'Tải ảnh lên'}
          <input aria-label="Tải ảnh tham chiếu" type="file" disabled={busy} accept="image/jpeg,image/png,image/webp" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <p>
          JPG, PNG hoặc WebP · Tối đa 5 MB
        </p>
        {message && <div role="status" className={`student-notice ${failed ? 'error' : 'success'}`}>
          {message}
        </div>}
      </section>
      <div className="student-stack">
        <section className="student-panel">
          <div className="student-section-heading">
            <div>
              <h2>
                Thông tin tài khoản
              </h2>
              <p>
                Thông tin được đồng bộ từ tài khoản của bạn.
              </p>
            </div>
            <User size={20} />
          </div>
          <dl className="student-profile-details">
            {[['Họ và tên', profile?.fullName], ['Mã sinh viên', profile?.username], ['Lớp hành chính', profile?.className], ['Email', profile?.email], ['Khoa / ngành', profile?.department]].map(([label, value]) => <div key={label}>
              <dt>
                {label}
              </dt>
              <dd>
                {value || '—'}
              </dd>
            </div>)}
          </dl>
        </section>
        <section className="student-photo-guide">
          <ShieldCheck size={24} />
          <div>
            <h2>
              Một bức ảnh rõ nét giúp xác minh chính xác
            </h2>
            <p>
              Chụp chính diện, đủ sáng và chỉ có một người trong ảnh. Tránh đeo khẩu trang hoặc dùng bộ lọc làm thay đổi khuôn mặt.
            </p>
            <p>
              Ảnh được dùng làm tham chiếu nhận diện trong phiên thi có giám sát.
            </p>
          </div>
        </section>
      </div>
    </div>
  </div>;
}

export function ExamRunner({ attempt, selected, remaining, monitoring, savingQuestion, pendingQuestions = [], failedQuestions, onChoose, onSubmit, submitting, expired=false, violationCount, fullscreenActive, onFullscreen }: { attempt: StudentAttempt; selected: Record<number, number>; remaining: string; monitoring?:ReactNode; savingQuestion: number | null; pendingQuestions?: number[]; failedQuestions: number[]; onChoose: (q: number, a: number) => void; onSubmit: () => void; submitting: boolean; expired?:boolean; violationCount: number; fullscreenActive: boolean; onFullscreen: () => void }) {
  const [flagged, setFlagged] = useState<number[]>([]);
  const [current, setCurrent] = useState(0);
  const [filter, setFilter] = useState('all');
  const [mapOpen, setMapOpen] = useState(false);
  const questionRefs = useRef(new Map<number, HTMLElement>());
  const answered = attempt.questions.filter(q => selected[q.questionId] !== undefined).length;
  const total = attempt.questions.length;
  const seconds = remaining.split(':').reduce((n, part) => n * 60 + Number(part), 0);
  const urgent = seconds <= 300;
  const jump = (index: number) => { if(index < 0) return; setMapOpen(false); setCurrent(index); const question = attempt.questions[index]; if(question) questionRefs.current.get(question.questionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  useEffect(() => { const observer = new IntersectionObserver(entries => { const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if(visible) setCurrent(Number((visible.target as HTMLElement).dataset.index)); }, { rootMargin: '-150px 0px -45% 0px', threshold: 0 }); questionRefs.current.forEach(element => observer.observe(element)); return () => observer.disconnect(); }, [attempt.attemptId]);
  return <div className="student-exam">
    <div className="student-exam-toolbar">
      <div>
        <span className="student-eyebrow">
          {attempt.courseCode}{" · PHIÊN LÀM BÀI"}</span>
        <h1>
          {attempt.examTitle}
        </h1>
        <span className="student-exam-progress-label">{"Đã chọn "}{answered}
          /
          {total}{" câu"}</span>
      </div>
      <div className="student-exam-toolbar-actions">
        <button className="student-mobile-map-toggle" aria-expanded={mapOpen} aria-controls="student-exam-navigation" onClick={() => setMapOpen(open => !open)}>
          {mapOpen ? <X size={16} /> : <LayoutDashboard size={16} />}{" Câu hỏi"}</button>
        {monitoring}
        <div className={`student-timer ${urgent ? 'urgent' : ''}`} role="timer" aria-label={`Thời gian còn lại ${remaining}`}>
          <Clock3 size={21} />
          <div>
            <span>
              {urgent ? 'Sắp hết giờ' : 'Thời gian còn lại'}
            </span>
            <strong>
              {remaining}
            </strong>
          </div>
        </div>
        <button onClick={onSubmit} disabled={submitting || savingQuestion !== null} className="student-button primary">
          {submitting ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}

          {submitting ? 'Đang nộp...' : 'Nộp bài'}
        </button>
      </div>
    </div>

    <div className="student-exam-grid">
      <div className="student-question-list">
        {violationCount > 0 && <div className="student-notice warning" role="alert">
          <AlertTriangle size={20} />
          <span>
            <strong>{"Cảnh báo "}{violationCount}
              /3
            </strong>
            <br />
            {violationCount >= 3 ? 'Hệ thống đang tự động nộp bài.' : 'Vui lòng giữ trang thi ở chế độ toàn màn hình. Bài thi tự nộp khi đủ 3 lần cảnh báo.'}
          </span>
        </div>}
        {attempt.questions.map((q, index) => {
          const marked = flagged.includes(q.questionId); const failed = failedQuestions.includes(q.questionId); return <article key={q.questionId} ref={element => { if(element) questionRefs.current.set(q.questionId, element); else questionRefs.current.delete(q.questionId); }} data-index={index} className={`student-question ${current === index ? 'current' : ''}`} id={`student-question-${q.questionId}`}>
            <div className="student-question-heading">
              <div>
                <span className="student-question-number">{"Câu "}{q.position}
                </span>
                <span className="student-question-points">
                  {q.points}{" điểm "}{q.cloCode ? ` · ${q.cloCode}` : ''}
                </span>
              </div>
              <button className={`student-flag ${marked ? 'marked' : ''}`} aria-pressed={marked} aria-label={`${marked ? 'Bỏ đánh dấu' : 'Đánh dấu xem lại'} câu ${q.position}`} onClick={() => setFlagged(prev => marked ? prev.filter(id => id !== q.questionId) : [...prev, q.questionId])}>
                <Flag size={16} />
                <span>
                  {marked ? 'Đã đánh dấu' : 'Xem lại'}
                </span>
              </button>
            </div>
            <h2>
              {q.content}
            </h2>
            <div className="student-options" role="radiogroup" aria-label={`Đáp án câu ${q.position}`}>
              {q.options.map((opt, optionIndex) => {
                const active = selected[q.questionId] === opt.id; return <button key={opt.id} disabled={submitting||expired} role="radio" aria-checked={active} tabIndex={active || selected[q.questionId] === undefined && optionIndex === 0 ? 0 : -1} onKeyDown={event => { const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0; if(!direction) return; event.preventDefault(); const next = (optionIndex + direction + q.options.length) % q.options.length; event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus(); onChoose(q.questionId, q.options[next].id); }} className={`student-option ${active ? 'selected' : ''}`} onClick={() => onChoose(q.questionId, opt.id)}>
                  <span className="student-option-letter">
                    {opt.label}
                  </span>
                  <span>
                    {opt.content}
                  </span>
                  <span className="student-option-indicator">
                    {active && <Check size={14} />}
                  </span>
                </button>;
              })}
            </div>
            {failed && !pendingQuestions.includes(q.questionId) && savingQuestion !== q.questionId && <div className="student-question-save failed" role="status">
              <AlertTriangle size={13} />Chưa đồng bộ lên máy chủ. Hệ thống sẽ tự thử lại.
            </div>}
          </article>;
        })}
        <div className="student-question-pagination">
          <button className="student-button secondary" disabled={current <= 0} onClick={() => jump(current - 1)}>
            <ArrowLeft size={16} />{" Câu trước"}</button>
          <span>
            {current + 1}
            /
            {total}
          </span>
          <button className="student-button secondary" disabled={current >= total - 1} onClick={() => jump(current + 1)}>{"Câu tiếp "}<ArrowRight size={16} />
          </button>
        </div>
      </div>

      <aside id="student-exam-navigation" className={`student-exam-sidebar ${mapOpen ? 'map-open' : ''}`}>
        <section className="student-panel">
          <div className="student-section-heading">
            <h2>
              Tiến độ làm bài
            </h2>
            <span className="student-count">
              {Math.round(answered / (total || 1) * 100)}
              %
            </span>
          </div>
          <div className="student-exam-sidebar-body">
            <div className="student-progress-track">
              <span style={{ width: `${answered / (total || 1) * 100}%` }} />
            </div>
            <div className="student-progress-counts">
              <span>
                <strong>
                  {answered}
                </strong>{" Đã chọn"}</span>
              <span>
                <strong>
                  {total - answered}
                </strong>{" Chưa chọn"}</span>
              <span>
                <strong>
                  {flagged.length}
                </strong>{" Xem lại"}</span>
            </div>
            <label className="student-question-filter">{"Hiển thị câu hỏi "}<select value={filter} onChange={e => setFilter(e.target.value)}>
                <option value="all">
                  Tất cả câu hỏi
                </option>
                <option value="unanswered">
                  Chưa trả lời
                </option>
                <option value="flagged">
                  Đánh dấu xem lại
                </option>
              </select>
            </label>
            <nav className="student-question-map" aria-label="Điều hướng câu hỏi">
              {attempt.questions.map((q, index) => filter === 'unanswered' && selected[q.questionId] !== undefined || filter === 'flagged' && !flagged.includes(q.questionId) ? null : <button key={q.questionId} className={`${selected[q.questionId] !== undefined ? 'answered' : ''} ${flagged.includes(q.questionId) ? 'flagged' : ''} ${failedQuestions.includes(q.questionId) ? 'save-failed' : ''} ${current === index ? 'active' : ''}`} aria-label={`Câu ${q.position}, ${selected[q.questionId] !== undefined ? 'đã chọn' : 'chưa trả lời'}${flagged.includes(q.questionId) ? ', đánh dấu xem lại' : ''}`} aria-current={current === index ? 'step' : undefined} onClick={() => jump(index)}>
                {q.position}
                {flagged.includes(q.questionId) && <Flag size={9} />}
              </button>)}
            </nav>
            {filter === 'flagged' && !flagged.length && <p className="student-muted">
              Chưa có câu đánh dấu.
            </p>}
            {filter === 'unanswered' && answered === total && <p className="student-muted">
              Bạn đã trả lời tất cả câu hỏi.
            </p>}
            <div className="student-map-legend">
              <span>
                <i className="answered" />{" Đã chọn"}</span>
              <span>
                <i />{" Chưa chọn"}</span>
              <span>
                <Flag size={12} />{" Xem lại"}</span>
            </div>
          </div>
        </section>
        <section className="student-exam-note">
          <span className={`student-badge ${fullscreenActive ? 'green' : 'amber'}`}>
            <ShieldCheck size={14} />
            {fullscreenActive ? 'Đang toàn màn hình' : 'Chưa toàn màn hình'}
          </span>
          <p>
            Giữ trang thi luôn mở. Đáp án được lưu khi bạn lựa chọn.
          </p>
          {!fullscreenActive && <button onClick={onFullscreen} className="student-text-button">
            <Maximize2 size={15} />{" Bật toàn màn hình"}</button>}
          <p className="student-muted">
            Đánh dấu xem lại chỉ được giữ trong phiên làm bài hiện tại.
          </p>
        </section>
        <button className="student-button secondary student-full-width" onClick={() => jump(attempt.questions.findIndex(q => selected[q.questionId] === undefined))} disabled={answered === total}>
          <ArrowDown size={16} />{" Đến câu chưa trả lời"}</button>
      </aside>
    </div>

  </div>;
}

export function ResultDetail({ result, onBack }: { result: StudentResult; onBack: () => void }) {
  const percent = Math.round(result.score / (result.totalPoints || 1) * 100);
  return <div className="student-stack">
    <button onClick={onBack} className="student-text-button">
      <ArrowLeft size={16} />{" Tất cả kết quả"}</button>
    <PageHeading eyebrow="KẾT QUẢ BÀI THI" title={result.examTitle} description={`${result.courseCode} · ${result.courseName}`} />
    <section className="student-result-summary">
      <div>
        <span className="student-badge green">
          <CheckCircle2 size={14} />{" Đã hoàn thành"}</span>
        <h2>
          Bạn đã hoàn thành bài thi!
        </h2>
        <p>{"Nộp lúc "}{date(result.submittedAt)}
        </p>
        <div className="student-result-metrics">
          <span>
            <strong>
              {result.correctAnswers}
              /
              {result.totalQuestions}
            </strong>{" Câu trả lời đúng"}</span>
          <span>
            <strong>
              {percent}
              %
            </strong>{" Tỷ lệ điểm đạt được"}</span>
        </div>
      </div>
      <div className="student-score-ring" style={{ background: `conic-gradient(var(--student-primary) ${Math.min(100, Math.max(0, percent))}%, #e4eaf3 0)` }}>
        <div>
          <Trophy size={24} />
          <strong>
            {result.score}
            <small>
              /
              {result.totalPoints}
            </small>
          </strong>
          <span>
            TỔNG ĐIỂM
          </span>
        </div>
      </div>
    </section>
    <section className="student-panel">
      <div className="student-section-heading">
        <div>
          <h2>
            Mức độ đạt chuẩn đầu ra
          </h2>
          <p>
            Nhìn lại điểm mạnh và nội dung cần ôn tập theo từng CLO.
          </p>
        </div>
        <BookOpen size={21} />
      </div>
      {result.cloAchievement.length ? <div className="student-clo-list">
        {result.cloAchievement.map(clo => <div className="student-clo" key={clo.cloId}>
          <div>
            <span className="student-badge">
              {clo.cloCode}
            </span>
            <strong>
              {clo.description}
            </strong>
            <span className="student-clo-percent">
              {clo.achievementPercent}
              %
            </span>
          </div>
          <div className="student-progress-track">
            <span style={{ width: `${Math.min(100, Math.max(0, clo.achievementPercent))}%` }} />
          </div>
          <p>
            {clo.correctQuestions}
            /
            {clo.answeredQuestions}{" câu đúng trong nhóm chuẩn đầu ra này"}</p>
        </div>)}
      </div> : <EmptyState title="Chưa có phân tích chuẩn đầu ra" description="Bài thi này chưa có dữ liệu đánh giá theo CLO." />}
    </section>
  </div>;
}
