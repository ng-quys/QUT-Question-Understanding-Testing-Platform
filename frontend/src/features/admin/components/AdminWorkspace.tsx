import { AdminExamReviewDialog } from './AdminExamReviewDialog';
import { AiCreditsAdmin } from './AiCreditsAdmin';
import { ExamOrganization } from '../../sessions/components/ExamOrganization';
import { ADMIN_REFRESH_INTERVAL_MS } from '../../sessions/services/visiblePolling';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  LockKeyhole,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  adminWorkspaceApi,
  emptyFilters,
  type AdminTab,
  type DataRow,
  type Filters,
  type Page,
  type Report,
  type WorkspaceApi,
} from '../services/adminWorkspaceApi';
import type { AdminDashboard, AdminUser, AiRuntime } from '../services/adminService';
import { AdminAccountDialog } from './AdminAccountDialog';
import { AdminAttemptDialog } from './AdminAttemptDialog';
import { AdminSessionDialog } from './AdminSessionDialog';
import { AdminImportDialog } from './AdminImportDialog';
import { AdminResourceDialog } from './AdminResourceDialog';
import { AdminCatalogDialog } from './AdminCatalogDialog';
import type { CatalogKind } from '../services/adminWorkspaceApi';
import { useBodyScrollLock } from './adminAccessibility';
import { AdminOverview, ReportSummary } from './AdminOverview';
import {
  accountSubTabs,
  adminTabs,
  dataColumns,
  initials,
  isAccount,
  isAttempt,
  monitorSubTabs,
  sidebarStructure,
  statuses,
  type SubTab,
} from './adminConfig';
import { Badge, formatDate, DataTable, downloadCsv, Empty, labels, Loading, Modal, Notice, number, value } from './AdminUI';
import '../styles/admin.css';

const exportLabels: Record<string, string> = {
  id: 'ID',
  username: 'Tên đăng nhập',
  fullName: 'Họ tên',
  email: 'Email',
  role: 'Vai trò',
  department: 'Khoa / đơn vị',
  status: 'Trạng thái',
  createdAt: 'Ngày tạo',
  code: 'Mã',
  name: 'Tên',
  questionCount: 'Số câu hỏi',
  examCount: 'Số đề thi',
  sessionCount: 'Số ca thi',
  title: 'Tên đề thi',
  courseCode: 'Mã học phần',
  courseName: 'Tên học phần',
  totalQuestions: 'Số câu',
  totalPoints: 'Tổng điểm',
  antiCheatMode: 'Bật AI',
  examCode: 'Mã đề',
  examTitle: 'Tên đề',
  examId: 'ID đề thi',
  className: 'Lớp',
  roomCode: 'Mã ca thi',
  sessionCode: 'Mã ca thi',
  startTime: 'Bắt đầu',
  endTime: 'Kết thúc',
  registeredCount: 'Đã tham gia',
  attemptCount: 'Lượt thi',
  studentUsername: 'Tài khoản sinh viên',
  studentName: 'Họ tên sinh viên',
  sessionId: 'ID ca thi',
  startedAt: 'Bắt đầu làm',
  submittedAt: 'Nộp bài',
  score: 'Điểm',
  browserEvents: 'Cảnh báo trình duyệt',
  aiEvents: 'Sự kiện AI',
  reviewOutcome: 'Kết quả xem xét',
  actorUsername: 'Người thực hiện',
  actorId: 'ID người thực hiện',
  action: 'Hành động',
  targetType: 'Đối tượng',
  targetId: 'ID đối tượng',
  detail: 'Chi tiết',
  averageScore: 'Điểm trung bình',
  examDate: 'Ngày thi',
  riskScore: 'Điểm rủi ro',
};

// ── Sidebar component ─────────────────────────────────────────────────────────

function Sidebar({
  tab,
  openGroups,
  toggleGroup,
  go,
  mobile,
  onClose,
  onLogout,
  compact,
  collapsed,
  onToggle,
  panelRef,
}: {
  tab: AdminTab;
  openGroups: Set<string>;
  toggleGroup: (id: string) => void;
  go: (t: AdminTab, sub?: string) => void;
  mobile: boolean;
  onClose: () => void;
  onLogout: () => void;
  compact: boolean;
  collapsed: boolean;
  onToggle: () => void;
  panelRef: RefObject<HTMLElement | null>;
}) {
  return (
    <aside id="admin-sidebar" ref={panelRef} className={`admin-sidebar ${mobile ? 'open' : ''}`} aria-label="Menu quản trị" inert={compact && !mobile}>
      <div className="admin-sidebar-heading"><a
        className="admin-brand"
        href="#admin-main"
        aria-label="ExamFlow — Tổng quan quản trị"
        title={collapsed ? 'ExamFlow — Tổng quan' : undefined}
        onClick={e => { e.preventDefault(); go('overview'); }}
      >
        <span aria-hidden="true">E</span>
        <div>ExamFlow<small>Quản trị</small></div>
      </a>
        <button className="admin-sidebar-toggle" aria-controls="admin-sidebar" aria-expanded={!collapsed} aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'} title={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'} onClick={onToggle}>
          {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
        </button>
      </div>

      <button className="admin-sidebar-close" aria-label="Đóng menu" title="Đóng menu" onClick={onClose}>
        <X size={20} />
      </button>

      <nav aria-label="Điều hướng quản trị">
        {sidebarStructure.map(item => {
          if ('children' in item && Array.isArray(item.children)) {
            const group = item as { groupId: string; label: string; icon: React.ComponentType<{ size?: number }>; children: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ size?: number }> }> };
            const isOpen = openGroups.has(group.groupId);
            const hasActive = group.children.some(child => child.id === tab);
            return (
              <div key={group.groupId} className="admin-nav-group-section">
                <button
                  className={`admin-nav-group-toggle ${hasActive ? 'has-active' : ''}`}
                  aria-expanded={isOpen}
                  onClick={() => toggleGroup(group.groupId)}
                >
                  <group.icon size={18} />
                  <span>{group.label}</span>
                  <ChevronDown size={14} className={`admin-chevron ${isOpen ? 'open' : ''}`} />
                </button>
                {(isOpen || collapsed) && (
                  <div className="admin-nav-children">
                    {group.children.map(child => (
                      <button
                        key={child.id}
                        className={`admin-nav-child ${tab === child.id ? 'active' : ''}`}
                        aria-current={tab === child.id ? 'page' : undefined}
                        aria-label={child.label}
                        title={collapsed ? child.label : undefined}
                        onClick={() => go(child.id)}
                      >
                        <child.icon size={16} />
                        <span>{child.label}</span>
                        {tab === child.id && <ChevronRight size={12} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          const single = item as { id: AdminTab; label: string; icon: React.ComponentType<{ size?: number }> };
          return (
            <button
              key={single.id}
              className={tab === single.id ? 'active' : ''}
              aria-current={tab === single.id ? 'page' : undefined}
              aria-label={single.label}
              title={collapsed ? single.label : undefined}
              onClick={() => go(single.id)}
            >
              <single.icon size={18} />
              <span>{single.label}</span>
              {tab === single.id && <ChevronRight size={14} />}
            </button>
          );
        })}
      </nav>

      <button className="admin-logout" aria-label="Đăng xuất" title={collapsed ? 'Đăng xuất' : undefined} onClick={onLogout}>
        <LogOut size={16} /><span>Đăng xuất</span>
      </button>
    </aside>
  );
}

// ── InPageTabs component ──────────────────────────────────────────────────────

function InPageTabs({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: SubTab[];
  active: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div className="admin-in-page-tabs" role="tablist" aria-label={label}>
      {tabs.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          tabIndex={active === t.id ? 0 : -1}
          className={`admin-in-page-tab ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
          onKeyDown={e => {
            if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            const idx = tabs.findIndex(x => x.id === active);
            const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : e.key === 'ArrowRight' ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
            onChange(tabs[next].id);
            (e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next])?.focus();
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Main WorkspaceComponent ───────────────────────────────────────────────────

export function AdminWorkspace({
  fullName,
  email,
  onLogout,
  api = adminWorkspaceApi,
}: {
  fullName: string;
  email: string;
  onLogout: () => void;
  api?: WorkspaceApi;
}) {
  const [tab, setTab] = useState<AdminTab>('overview');
  // Sub-tab state for composite screens
  const [accountSubTab, setAccountSubTab] = useState('all');
  const [monitorSubTab, setMonitorSubTab] = useState('warned');
  const [warnedSession,setWarnedSession]=useState<DataRow|null>(null);
  const warnedSessionList=tab==='monitor'&&monitorSubTab==='warned'&&!warnedSession;

  const [mobile, setMobile] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 1024px)').matches);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('examflow.admin.sidebarCollapsed') === 'true'; }
    catch { return false; }
  });
  const collapsed = sidebarCollapsed && !compact;

  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try { localStorage.setItem('examflow.admin.sidebarCollapsed', String(next)); }
    catch { /* Navigation remains usable when browser storage is unavailable. */ }
  }
  const sidebarRef = useRef<HTMLElement>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['organization','examination']));
  const [draft, setDraft] = useState<Filters>({ ...emptyFilters });
  const [filters, setFilters] = useState<Filters>({ ...emptyFilters });
  const [pageIndex, setPageIndex] = useState(0);
  const [size, setSize] = useState(20);
  const [revision, setRevision] = useState(0);

  const [page, setPage] = useState<Page>({ items: [], total: 0, page: 0, size: 20 });
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const loadedTableKey=useRef<string|null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState('');
  const [runtime, setRuntime] = useState<AiRuntime | null>(null);

  // Dialog states
  const [account, setAccount] = useState<AdminUser | null | undefined>(undefined);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [resource, setResource] = useState<{ kind: 'courses' | 'exams'; row: DataRow } | null>(null);
  const [managedSittingId,setManagedSittingId]=useState<number|null>(null);
  const [examReviewId,setExamReviewId]=useState<number|null>(null);
  const [catalog, setCatalog] = useState<{ kind: CatalogKind; id: number | null } | null>(null);

  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    action: () => Promise<unknown>;
  } | null>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState('');

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const exportCancelled = useRef(false);
  const loadSeq = useRef(0);
  useBodyScrollLock(mobile && compact);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1024px)');
    const resize = () => { setCompact(media.matches); if (!media.matches) setMobile(false); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);

  useEffect(() => {
    if (!mobile || !compact) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = sidebarRef.current;
    panel?.querySelector<HTMLElement>('[aria-current="page"], .admin-sidebar-close')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMobile(false); return; }
      if (event.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')).filter(item => item.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [mobile, compact]);

  useEffect(() => {
    if (tab !== 'monitor' || !autoRefresh || loading || refreshing || mobile || account !== undefined || attemptId !== null || sessionId !== null || resource || catalog || showImport || confirm || exporting) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') setRevision(value => value + 1); }, ADMIN_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [tab, autoRefresh, loading, refreshing, mobile, account, attemptId, sessionId, resource, catalog, showImport, confirm, exporting]);

  // Resolve effective backend tab + filters for composite tabs
  const effectiveApiResource = (() => {
    if (tab === 'accounts') {
      if (accountSubTab === 'student') return 'students';
      if (accountSubTab === 'teacher') return 'teachers';
      return 'users';
    }
    if (tab === 'monitor') {
      // 'warned' sub-tab — use 'anti' to get anti-cheat flagged list
      if (monitorSubTab === 'warned') return warnedSession?'anti':'warning-sessions';
      return 'attempts';
    }
    return tab;
  })();

  const current = adminTabs.find(item => item.id === tab) ?? adminTabs[0];

  // Load data — sequence-guarded so a slow earlier response never overwrites newer filters.
  useEffect(() => {
    if(['aiCredits','organization','studentClasses','sessionList','sessions','liveSessions'].includes(tab)){setLoading(false);setRefreshing(false);return;}
    const seq = ++loadSeq.current;
    let active = true;
    const queryKey=JSON.stringify([tab,effectiveApiResource,filters,pageIndex,size,warnedSession?.id,monitorSubTab]);
    const background=tab==='monitor'&&loadedTableKey.current===queryKey;
    setLoading(!background);
    setRefreshing(background);
    if(!background){setError('');setLoadError('');}

    async function load() {
      try {
        if (tab === 'overview') {
          const [data, summary] = await Promise.all([api.dashboard(), api.report(emptyFilters)]);
          if (active && loadSeq.current === seq) {
            setDashboard(data);
            setReport(summary);
            setLastUpdated(new Date());
          }
        } else {
          const [data, summary] = await Promise.all([
            api.page(effectiveApiResource, {...filters,...(tab==='monitor'&&monitorSubTab==='warned'&&warnedSession?{sessionId:String(warnedSession.id)}:{})}, pageIndex, size),
            tab === 'reports' ? api.report(filters) : Promise.resolve(null),
          ]);
          if (active && loadSeq.current === seq) {
            const last = Math.max(0, Math.ceil(data.total / size) - 1);
            if (pageIndex > last) setPageIndex(last);
            else {setPage(data);loadedTableKey.current=queryKey;}
            if (summary) setReport(summary);
            setError('');setLoadError('');
            setLastUpdated(new Date());
          }
        }
      } catch (cause) {
        if (active && loadSeq.current === seq) {
          const message = cause instanceof Error ? cause.message : 'Không thể tải dữ liệu';
          if(background)setToast('Chưa cập nhật được cảnh báo. Đang giữ dữ liệu gần nhất; hệ thống sẽ thử lại.');
          else {setError(message);setLoadError(message);}
        }
      } finally {
        if (active && loadSeq.current === seq) {setLoading(false);setRefreshing(false);}
      }
    }

    void load();
    return () => { active = false; };
  }, [api, tab, effectiveApiResource, filters, pageIndex, size, revision, warnedSession, monitorSubTab]);

  // Poll AI Runtime status
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await api.aiRuntime();
        if (active) setRuntime(data);
      } catch {
        if (active) setRuntime({ ok: false, ready: false, running: false, status: 'offline', message: 'Không thể kết nối dịch vụ giám sát AI' });
      } finally {
        if (active) timer = setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [api]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => () => { exportCancelled.current = true; }, []);

  function go(next: AdminTab, sub?: string) {
    loadedTableKey.current=null;
    exportCancelled.current = true;
    loadSeq.current++;
    setTab(next);
    setMobile(false);
    if(next!=='sessionList')setManagedSittingId(null);
    setWarnedSession(null);
    setDraft({ ...emptyFilters });
    setFilters({ ...emptyFilters });
    setPageIndex(0);
    setError('');
    setLoading(true);
    setLastUpdated(null);
    setPage({ items: [], total: 0, page: 0, size });
    setResource(null);
    const groupId = sidebarStructure.find(item => item.children?.some(child => child.id === next))?.groupId;
    if (groupId) setOpenGroups(previous => new Set([...previous, groupId]));
    // Preserve deep-link sub-tab when provided (e.g. quick links), otherwise reset.
    if (next === 'accounts') setAccountSubTab(sub === 'student' || sub === 'teacher' ? sub : 'all');
    else setAccountSubTab('all');
    setWarnedSession(null);
    setMonitorSubTab('warned');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function toggleGroup(id: string) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function refresh() {
    if (tab === 'aiCredits') window.dispatchEvent(new Event('examflow-admin-ai-credits-refresh'));
    else setRevision(p => p + 1);
  }

  function apply(event: React.FormEvent) {
    event.preventDefault();
    exportCancelled.current = true;
    if (draft.from && draft.to && draft.from > draft.to) {
      setError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
      return;
    }
    setPageIndex(0);
    setFilters({ ...draft });
  }

  function setDatePreset(days: number) {
    const today = new Date();
    const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const toStr = localDate(today);
    const fromDate = new Date();
    fromDate.setDate(today.getDate() - Math.max(0, days - 1));
    setDraft(prev => ({ ...prev, from: localDate(fromDate), to: toStr }));
  }

  function saved(message = 'Đã lưu thay đổi.') {
    setAccount(undefined);
    setToast(message);
    refresh();
  }

  async function perform() {
    if (!confirm || acting) return;
    setActing(true);
    setActionError('');
    try {
      await confirm.action();
      setConfirm(null);
      saved();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Không thể thực hiện thao tác');
    } finally {
      setActing(false);
    }
  }

  function ask(title: string, description: string, action: () => Promise<unknown>) {
    setActionError('');
    setConfirm({ title, description, action });
  }

  async function exportRows() {
    if (exporting) return;
    setExporting(true);
    exportCancelled.current = false;
    setExportProgress(0);
    setError('');
    try {
      const rows: DataRow[] = [];
      let next = 0;
      let total = 1;
      while (next * 100 < total) {
        const result = await api.page(effectiveApiResource, {...filters,...(tab==='monitor'&&monitorSubTab==='warned'&&warnedSession?{sessionId:String(warnedSession.id)}:{})}, next++, 100);
        if (exportCancelled.current) return;
        total = result.total;
        if (!result.items.length) break;
        rows.push(...result.items);
        setExportProgress(rows.length);
      }
      if (exportCancelled.current) return;

      const unique = [...new Map(rows.map(row => [row.id, row])).values()];
      const keys = Object.keys(unique[0] || {}).filter(key => key !== 'accessCode');
      downloadCsv(
        `ExamFlow-${effectiveApiResource}-${new Date().toISOString().slice(0, 10)}.csv`,
        keys.map(key => exportLabels[key] || key),
        unique.map(row =>
          keys.map(key =>
            ['status', 'role', 'reviewOutcome'].includes(key)
              ? labels[value(row, key)] || value(row, key)
              : row[key]
          )
        )
      );
      setToast(`Đã xuất ${unique.length.toLocaleString('vi-VN')} bản ghi theo bộ lọc.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xuất dữ liệu');
    } finally {
      setExporting(false);
    }
  }

  function edit(row: DataRow) {
    setAccount({
      id: number(row, 'id'),
      username: value(row, 'username'),
      fullName: value(row, 'fullName'),
      email: value(row, 'email'),
      role: value(row, 'role'),
      status: value(row, 'status'),
      department: row.department == null ? '' : value(row, 'department'),
      studentClassId: row.studentClassId==null?null:number(row,'studentClassId'),
      classCode: row.classCode==null?undefined:value(row,'classCode'),
      className: row.className==null?undefined:value(row,'className'),
      createdAt: value(row, 'createdAt'),
    });
  }

  // Determine the logical tab for column/action resolution
  // 'accounts' acts like 'users'; 'monitor' on 'warned' sub-tab acts like 'anti'
  const columnTab: AdminTab = tab === 'accounts' ? 'users' : tab === 'monitor' ? (monitorSubTab === 'warned' ? 'anti' : 'attempts') : tab;
  function selectWarningSession(row:DataRow|null){exportCancelled.current=true;loadSeq.current++;setWarnedSession(row);setPageIndex(0);setPage({items:[],total:0,page:0,size});setLoading(true);setDraft({...emptyFilters});setFilters({...emptyFilters});setError('');setLoadError('');}
  const columns = warnedSessionList ? [
    {key:'name',title:'Ca thi / Phòng',render:(row:DataRow)=><div className="admin-cell-title"><strong>{value(row,'name')}</strong><span>{value(row,'sessionCode')}</span></div>},
    {key:'examCode',title:'Đề thi / Học phần',render:(row:DataRow)=><div className="admin-cell-title"><strong>{value(row,'examCode')}</strong><span>{value(row,'courseName')}</span></div>},
    {key:'startTime',title:'Thời gian thi',render:(row:DataRow)=>formatDate(value(row,'startTime'))},
    {key:'warnedStudents',title:'Sinh viên có cảnh báo',numeric:true},
    {key:'browserEvents',title:'Cảnh báo',render:(row:DataRow)=><span className="admin-tag amber">{number(row,'browserEvents')} trình duyệt · {number(row,'aiEvents')} AI</span>},
    {key:'status',title:'Trạng thái',render:(row:DataRow)=><Badge status={value(row,'status')}/>},
    {key:'detail',title:'Chi tiết',render:(row:DataRow)=><button className="admin-button secondary small" onClick={()=>selectWarningSession(row)}><Eye size={14}/>Xem sinh viên</button>}
  ] : dataColumns(columnTab);

  // Inject action buttons
  if (isAccount(tab)) {
    columns.push({
      key: 'actions',
      title: 'Thao tác',
      render: row =>
        value(row, 'role') === 'admin' ? (
          <span className="admin-muted">Tài khoản quản trị</span>
        ) : (
          <div className="admin-row-actions">
            <button
              className="admin-icon"
              aria-label={`Sửa tài khoản ${value(row, 'username')}`}
              title="Sửa thông tin hoặc đổi mật khẩu"
              onClick={() => edit(row)}
            >
              <Pencil size={15} />
            </button>
            <button
              className="admin-icon"
              aria-label={`${value(row, 'status') === 'active' ? 'Khóa' : 'Mở khóa'} tài khoản ${value(row, 'username')}`}
              title={value(row, 'status') === 'active' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
              onClick={() =>
                ask(
                  value(row, 'status') === 'active' ? 'Khóa tài khoản?' : 'Mở khóa tài khoản?',
                  `Áp dụng cho ${value(row, 'fullName')} (${value(row, 'username')}). Thay đổi có hiệu lực trên database chung và được ghi nhật ký.`,
                  () => api.updateUserStatus(number(row, 'id'), value(row, 'status') === 'active' ? 'locked' : 'active')
                )
              }
            >
              <LockKeyhole size={15} />
            </button>
          </div>
        ),
    });
  }

  if (tab === 'sessions') {
    columns.push({
      key: 'actions',
      title: 'Thao tác',
      render: row => (
        <div className="admin-row-actions"><button className="admin-icon" title="Xem chi tiết ca thi" aria-label={`Xem ca thi ${value(row,'roomCode')}`} onClick={() => setSessionId(number(row, 'id'))}><Eye size={15}/></button>
          <button className="admin-icon" title="Chỉ sửa ca chưa bắt đầu, chưa có bài làm" aria-label={`Sửa ca thi ${value(row,'roomCode')}`} disabled={value(row,'status')!=='scheduled'||number(row,'attemptCount')>0||new Date(value(row,'startTime')).getTime()<=(lastUpdated?.getTime()??0)} onClick={()=>setCatalog({kind:'sessions',id:number(row,'id')})}><Pencil size={15}/></button>
          <button className="admin-icon admin-danger" title="Chỉ xóa ca chưa bắt đầu/đã hủy, không có đăng ký hoặc bài làm" aria-label={`Xóa ca thi ${value(row,'roomCode')}`} disabled={!['scheduled','cancelled'].includes(value(row,'status'))||number(row,'attemptCount')>0||number(row,'registeredCount')>0||(value(row,'status')==='scheduled'&&new Date(value(row,'startTime')).getTime()<=(lastUpdated?.getTime()??0))} onClick={()=>ask('Xóa ca thi?',`Xóa ca ${value(row,'roomCode')}. Chỉ thực hiện khi không có sinh viên đăng ký hoặc bài làm. Thao tác được ghi nhật ký.`,()=>api.deleteCatalog('sessions',number(row,'id')))}><Trash2 size={15}/></button></div>
      ),
    });
  }

  if (tab === 'courses' || tab === 'exams') {
    const kind = tab;
    columns.push({ key: 'detail', title: 'Thao tác', render: row => {
      const used=kind==='exams'&&(value(row,'status')!=='draft'||number(row,'sessionCount')>0||number(row,'attemptCount')>0);
      const cannotDelete=used||(kind==='courses'&&(number(row,'questionCount')>0||number(row,'examCount')>0));
      return <div className="admin-row-actions"><button className="admin-icon" title="Xem chi tiết" aria-label={`Xem ${value(row,'code')}`} onClick={()=>setResource({kind,row})}><Eye size={15}/></button>
        <button className="admin-icon" title={used?'Đề đã được sử dụng hoặc không còn ở trạng thái nháp':'Sửa thông tin'} aria-label={`Sửa ${kind==='courses'?'học phần':'đề thi'} ${value(row,'code')}`} disabled={used} onClick={()=>setCatalog({kind,id:number(row,'id')})}><Pencil size={15}/></button>
        <button className="admin-icon admin-danger" title={cannotDelete?'Bản ghi đã có nội dung hoặc lịch sử liên quan':'Xóa bản ghi chưa sử dụng'} aria-label={`Xóa ${kind==='courses'?'học phần':'đề thi'} ${value(row,'code')}`} disabled={cannotDelete} onClick={()=>ask(`Xóa ${kind==='courses'?'học phần':'đề thi'}?`,`Xóa ${value(row,'code')} · ${value(row,kind==='courses'?'name':'title')}. Hệ thống sẽ kiểm tra dữ liệu liên quan trước khi xóa và ghi nhật ký.`,()=>api.deleteCatalog(kind,number(row,'id')))}><Trash2 size={15}/></button></div>;
    } });
  }

  if (tab === 'exams') {
    columns.push({
      key: 'antiCheatMode',
      title: 'Giám sát AI',
      render: row => (
        <button
          className={`admin-switch ${row.antiCheatMode ? 'on' : ''}`}
          role="switch"
          aria-checked={!!row.antiCheatMode}
          aria-label={`Giám sát AI đề ${value(row, 'code')}`}
          onClick={() =>
            ask(
              row.antiCheatMode ? 'Tắt giám sát AI?' : 'Bật giám sát AI?',
              `Áp dụng cho ${value(row, 'title')}. Hệ thống từ chối thay đổi nếu đang có sinh viên làm bài.`,
              () => api.aiPolicy(number(row, 'id'), !row.antiCheatMode)
            )
          }
        >
          <i />
          <span>{row.antiCheatMode ? 'Đang bật' : 'Đã tắt'}</span>
        </button>
      ),
    });
  }

  if (isAttempt(columnTab)&&!warnedSessionList) {
    columns.push({
      key: 'actions',
      title: 'Chi tiết',
      render: row => (
        <button className="admin-button secondary small" onClick={() => setAttemptId(number(row, 'id'))}>
          <Eye size={14} /> Xem
        </button>
      ),
    });
  }

  // Compute sub-tab list for current top-level tab
  const subTabs: SubTab[] | null =
    tab === 'accounts' ? accountSubTabs :
    tab === 'monitor' ? monitorSubTabs :
    null;
  const activeSubTab = tab === 'accounts' ? accountSubTab : tab === 'monitor' ? monitorSubTab : '';

  function changeSubTab(id: string) {
    exportCancelled.current = true;
    loadSeq.current++;
    setLoading(true);
    setPage({ items: [], total: 0, page: 0, size });
    if (tab === 'accounts') {
      setAccountSubTab(id);
    } else if (tab === 'monitor') {
      setMonitorSubTab('warned');
    }
    // Always reset page and filters when switching sub-tab
    setWarnedSession(null);
    setDraft({ ...emptyFilters });
    setFilters({ ...emptyFilters });
    setPageIndex(0);
    setError('');
  }

  // Status options for current logical tab
  const statusOptions = warnedSessionList?['scheduled','ongoing','completed','cancelled']:statuses[tab] ?? statuses[columnTab as AdminTab] ?? [];
  const filterNames: Record<keyof Filters, string> = { q: 'Tìm kiếm', status: 'Trạng thái', role: 'Vai trò', course: 'Học phần', sessionCode: 'Mã ca thi', from: 'Từ ngày', to: 'Đến ngày' };
  const activeFilters = (Object.entries(filters) as [keyof Filters, string][]).filter(([, item]) => item);
  const searchHint = isAccount(tab) ? 'Tìm họ tên, tài khoản hoặc email…' : tab === 'courses' ? 'Tìm mã, tên học phần hoặc khoa…' : tab === 'exams' ? 'Tìm mã đề, tên đề hoặc học phần…' : tab === 'audit' ? 'Tìm hành động, người thực hiện…' : tab === 'sessions' ? 'Tìm mã ca thi, tên ca, mã đề hoặc học phần…' : 'Tìm sinh viên, mã đề hoặc học phần…';

  return (
    <div className={`admin-workspace${collapsed ? ' sidebar-collapsed' : ''}`}>
      <a href="#admin-main" className="admin-skip">Đến nội dung chính</a>

      {mobile && (
        <button className="admin-sidebar-backdrop" aria-label="Đóng điều hướng" onClick={() => setMobile(false)} />
      )}

      <Sidebar
        tab={tab}
        openGroups={openGroups}
        toggleGroup={toggleGroup}
        go={go}
        mobile={mobile}
        onClose={() => setMobile(false)}
        onLogout={onLogout}
        compact={compact}
        collapsed={collapsed}
        onToggle={toggleSidebar}
        panelRef={sidebarRef}
      />

      <div className="admin-content" inert={mobile && compact}>
        <header className="admin-header">
          <div className="admin-header-left">
            <button className="admin-icon admin-mobile-menu" aria-label="Mở menu quản trị" title="Mở menu quản trị" onClick={() => setMobile(true)}>
              <Menu size={20} />
            </button>
            <span className="admin-breadcrumb">
              Quản trị <ChevronRight size={13} aria-hidden="true" />
              <strong>{tab === 'overview' ? 'Tổng quan hệ thống' : current.label}</strong>
            </span>
          </div>

          <div className="admin-header-right">
            <span className={`admin-runtime-pill ${runtime?.ok ? 'online' : ''}`} role="status" title={runtime?.message || 'Trạng thái dịch vụ giám sát AI'}>
              <i aria-hidden="true" />
              <span className="admin-runtime-text">{runtime?.ok ? 'Dịch vụ AI đã kết nối' : runtime ? 'AI chưa kết nối' : 'Đang kiểm tra AI'}</span>
            </span>
            <span className="admin-avatar" aria-hidden="true">{initials(fullName)}</span>
            <span className="admin-header-user">
              <strong>{fullName}</strong>
              <small className="admin-header-email">{email}</small>
            </span>
          </div>
        </header>

        <main id="admin-main" tabIndex={-1}>
          {/* Page Heading */}
          <div className="admin-page-heading">
            <div>
              <h1>{tab === 'overview' ? 'Tổng quan hệ thống' : current.label}</h1>
              <p>{current.description}</p>
            </div>

            <div className="admin-heading-actions">
              <button className="admin-button secondary" disabled={loading||refreshing} onClick={refresh}>
                <RefreshCw size={15} className={loading||refreshing ? 'animate-spin' : ''} />
                Làm mới
              </button>

              {!['aiCredits','overview','organization','studentClasses','sessionList','sessions','liveSessions'].includes(tab) && (
                <button
                  className="admin-button secondary"
                  disabled={exporting || loading || !!loadError}
                  onClick={() => void exportRows()}
                >
                  {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  {exporting ? `Đang xuất ${exportProgress} dòng...` : 'Xuất CSV'}
                </button>
              )}

              {exporting && <button className="admin-button ghost" onClick={() => { exportCancelled.current = true; }}>Hủy xuất</button>}

              {isAccount(tab) && (
                <>
                  <button className="admin-button secondary" onClick={() => setShowImport(true)}>
                    <Upload size={15} /> Nhập từ CSV
                  </button>
                  <button className="admin-button primary" onClick={() => setAccount(null)}>
                    <Plus size={16} /> Tạo tài khoản
                  </button>
                </>
              )}
              {(['courses','exams'] as string[]).includes(tab)&&<button className="admin-button primary" onClick={()=>setCatalog({kind:tab as CatalogKind,id:null})}><Plus size={16}/>Thêm {tab==='courses'?'học phần':tab==='exams'?'đề thi':'ca thi'}</button>}
            </div>
          </div>

          {error && (
            <Notice onClose={() => setError('')}>
              {error}
              <button className="admin-text-button" onClick={refresh}>Thử lại</button>
            </Notice>
          )}

          {['organization','studentClasses','sessionList','sessions','liveSessions'].includes(tab) ? <ExamOrganization key={`${tab}-${revision}`} initialTab={tab==='liveSessions'?'live':tab==='sessions'?'allocation':tab==='studentClasses'?'classes':tab==='sessionList'?'sessions':'rooms'} hideNavigation initialSittingId={managedSittingId} onManageSitting={id=>{setManagedSittingId(id);go('sessionList');}} onCreateSitting={()=>go('sessions')} request={api.organizationRequest} admin onOpenAttempt={setAttemptId} onOpenExam={setExamReviewId}/> : tab === 'overview' ? (
            loading ? (
              <Loading />
            ) : dashboard && report ? (
              <AdminOverview dashboard={dashboard} report={report} runtime={runtime} go={go} />
            ) : (
              <Empty title="Chưa tải được tổng quan" description={error || 'Thử tải lại danh sách.'} action={<button className="admin-button secondary" onClick={refresh}>Thử lại</button>} />
            )
          ) : tab === 'aiCredits' ? <AiCreditsAdmin /> : (
            <>
              {/* In-page sub-tabs for Accounts and Monitor */}
              {subTabs && subTabs.length > 1 && (
                <InPageTabs tabs={subTabs} active={activeSubTab} onChange={changeSubTab} label={tab === 'accounts' ? 'Phân loại tài khoản' : 'Chế độ xem giám sát'} />
              )}

              {/* Context hints */}
              {tab === 'monitor' && monitorSubTab === 'warned' && (
                <div className="admin-helper">
                  <ShieldAlert size={20} />
                  <p>
                    Xem xét bằng chứng trước khi đưa ra kết luận. Kết quả xem xét hỗ trợ công tác hậu kiểm và được ghi nhận trong báo cáo.
                  </p>
                </div>
              )}

              {tab === 'courses' && (
                <p className="admin-table-hint">
                  Tạo học phần và chọn giảng viên phụ trách. Học phần đã có nội dung được ngưng hoạt động thay vì xóa.
                </p>
              )}

              {/* Filter Form */}
              <form className="admin-filters" onSubmit={apply}>
                <label className="admin-search">
                  <Search size={17} />
                  <input
                    aria-label="Tìm kiếm dữ liệu quản trị"
                    placeholder={warnedSessionList?'Tìm tên ca, mã phòng, đề thi hoặc học phần…':searchHint}
                    maxLength={160}
                    value={draft.q}
                    onChange={e => setDraft({ ...draft, q: e.target.value })}
                  />
                </label>

                {statusOptions.length > 0 && (
                  <label className="admin-filter-label">
                    <span>Trạng thái</span>
                    <select
                      aria-label="Lọc trạng thái"
                      value={draft.status}
                      onChange={e => setDraft({ ...draft, status: e.target.value })}
                    >
                      <option value="">Tất cả trạng thái</option>
                      {statusOptions.map(s => (
                        <option key={s} value={s}>{labels[s] || s}</option>
                      ))}
                    </select>
                  </label>
                )}

                {/* Role filter only on 'all' sub-tab of Accounts (users) */}
                {tab === 'accounts' && accountSubTab === 'all' && (
                  <label className="admin-filter-label">
                    <span>Vai trò</span>
                    <select
                      aria-label="Lọc vai trò"
                      value={draft.role}
                      onChange={e => setDraft({ ...draft, role: e.target.value })}
                    >
                      <option value="">Tất cả vai trò</option>
                      <option value="student">Sinh viên</option>
                      <option value="teacher">Giảng viên</option>
                      <option value="admin">Quản trị viên</option>
                    </select>
                  </label>
                )}

                <button className="admin-button primary" type="submit">
                  <SlidersHorizontal size={15} /> Áp dụng
                </button>
                <button
                  type="button"
                  className="admin-button ghost"
                  onClick={() => {
                    exportCancelled.current = true;
                    setDraft({ ...emptyFilters });
                    setFilters({ ...emptyFilters });
                    setPageIndex(0);
                  }}
                >
                  Xóa lọc
                </button>

                {['exams', 'sessions', 'attempts', 'anti', 'reports', 'audit', 'monitor'].includes(tab) && (
                  <details className="admin-advanced-filters" open={tab === 'reports'}>
                    <summary>Bộ lọc chi tiết <ChevronDown size={14} /></summary>
                    <div>
                      {tab !== 'audit' && (
                        <label>
                          Mã học phần
                          <input
                            placeholder="Ví dụ: INT3306"
                            value={draft.course}
                            onChange={e => setDraft({ ...draft, course: e.target.value })}
                          />
                        </label>
                      )}
                      {(isAttempt(columnTab)) && (
                        <label>
                          Mã ca thi
                          <input
                            type="text"
                            maxLength={20}
                            placeholder="Ví dụ: EXAM-439CC267"
                            value={draft.sessionCode}
                            onChange={e => setDraft({ ...draft, sessionCode: e.target.value })}
                          />
                        </label>
                      )}
                      <label>
                        {tab === 'reports' ? 'Nộp từ ngày' : 'Từ ngày'}
                        <input
                          type="date"
                          value={draft.from}
                          max={draft.to || undefined}
                          onChange={e => setDraft({ ...draft, from: e.target.value })}
                        />
                      </label>
                      <label>
                        Đến hết ngày
                        <input
                          type="date"
                          value={draft.to}
                          min={draft.from || undefined}
                          onChange={e => setDraft({ ...draft, to: e.target.value })}
                        />
                      </label>
                      <div style={{ display: 'flex', gap: '6px', alignSelf: 'flex-end', paddingBottom: '2px' }}>
                        <button type="button" className="admin-button secondary small" onClick={() => setDatePreset(0)}>Hôm nay</button>
                        <button type="button" className="admin-button secondary small" onClick={() => setDatePreset(7)}>7 ngày qua</button>
                        <button type="button" className="admin-button secondary small" onClick={() => setDatePreset(30)}>30 ngày qua</button>
                      </div>
                    </div>
                  </details>
                )}
              </form>

              {activeFilters.length > 0 && <div className="admin-filter-chips" aria-label="Bộ lọc đang áp dụng"><span>Đang lọc</span>{activeFilters.map(([key, item]) => <button key={key} aria-label={`Bỏ lọc ${filterNames[key]}`} onClick={() => { exportCancelled.current = true; setDraft(previous => ({ ...previous, [key]: '' })); setFilters(previous => ({ ...previous, [key]: '' })); setPageIndex(0); }}>{filterNames[key]}: {['status', 'role'].includes(key) ? labels[item] || item : item}<X size={12} /></button>)}</div>}

              {tab === 'reports' && report && !loading && !loadError && <ReportSummary report={report} />}

              {tab==='monitor'&&monitorSubTab==='warned'&&warnedSession&&<div className="admin-warning-context"><button className="admin-button secondary" onClick={()=>selectWarningSession(null)}>← Tất cả ca có cảnh báo</button><div><strong>{value(warnedSession,'name')}</strong><span>{value(warnedSession,'sessionCode')} · {value(warnedSession,'examCode')}</span></div></div>}
              <div className="admin-result-toolbar"><h2>{tab === 'reports' ? 'Chi tiết kết quả' : tab === 'accounts' ? 'Danh sách tài khoản' : tab === 'monitor' ? monitorSubTab === 'warned' ? warnedSession?'Sinh viên có cảnh báo trong ca':'Ca thi có cảnh báo' : 'Danh sách lượt thi' : current.label}<small>{!loading && !loadError ? `${page.total.toLocaleString('vi-VN')} kết quả` : loadError ? 'Chưa tải được' : 'Đang cập nhật'}</small></h2>{tab === 'monitor' && <label className="admin-live-control"><input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} />Tự cập nhật mỗi {ADMIN_REFRESH_INTERVAL_MS/1000} giây</label>}</div>
              <DataTable
                columns={columns}
                page={{ ...page, page: pageIndex, size }}
                loading={loading}
                error={loadError}
                onPage={setPageIndex}
                onSize={next => { setSize(next); setPageIndex(0); }}
                onRetry={refresh}
              />
            </>
          )}

          <footer className="admin-page-footer">
            <span>ExamFlow</span>
            <span>{lastUpdated ? `Cập nhật lúc ${lastUpdated.toLocaleTimeString('vi-VN')}${tab === 'monitor' && autoRefresh ? ` · Tự cập nhật ${ADMIN_REFRESH_INTERVAL_MS/1000} giây` : ' · Bấm Làm mới để cập nhật'}` : 'Chưa có dữ liệu cập nhật'}</span>
          </footer>
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div className="admin-toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button aria-label="Đóng thông báo thành công" onClick={() => setToast('')}><X size={16} /></button>
        </div>
      )}

      {/* Account Dialog */}
      {account !== undefined && (
        <AdminAccountDialog
          user={account}
          api={api}
          onClose={() => setAccount(undefined)}
          onSaved={msg => saved(msg || (account ? 'Đã cập nhật tài khoản.' : 'Đã tạo tài khoản mới.'))}
        />
      )}

      {/* CSV Import Dialog */}
      {showImport && (
        <AdminImportDialog
          api={api}
          onClose={() => setShowImport(false)}
          onFinished={summary => { setToast(summary); refresh(); }}
        />
      )}

      {resource && <AdminResourceDialog resource={resource.kind} row={resource.row} onClose={() => setResource(null)} onNavigate={(next, course) => { go(next); setDraft({ ...emptyFilters, course }); setFilters({ ...emptyFilters, course }); }} />}
      {examReviewId!==null&&<AdminExamReviewDialog id={examReviewId} api={api} onClose={()=>setExamReviewId(null)} onEdit={()=>{setCatalog({kind:'exams',id:examReviewId});setExamReviewId(null);}} onChanged={()=>setRevision(v=>v+1)}/>}
      {catalog&&<AdminCatalogDialog kind={catalog.kind} id={catalog.id} api={api} onClose={()=>setCatalog(null)} onSaved={message=>{setCatalog(null);saved(message);}}/>}

      {/* Attempt Dialog */}
      {attemptId !== null && (
        <AdminAttemptDialog
          id={attemptId}
          api={api}
          onClose={() => setAttemptId(null)}
          onSaved={() => { setToast('Đã lưu đánh giá lượt thi.'); refresh(); }}
        />
      )}

      {/* Session Dialog */}
      {sessionId !== null && (
        <AdminSessionDialog
          id={sessionId}
          api={api}
          onClose={() => setSessionId(null)}
          onOpenAttempt={id => setAttemptId(id)}
          onSaved={msg => { setToast(msg); refresh(); }}
        />
      )}

      {/* Confirmation Modal */}
      {confirm && (
        <Modal
          title={confirm.title}
          description={confirm.description}
          onClose={() => setConfirm(null)}
          busy={acting}
        >
          {actionError && (
            <div className="admin-modal-body">
              <Notice tone="error">{actionError}</Notice>
            </div>
          )}
          <footer>
            <button className="admin-button secondary" disabled={acting} onClick={() => setConfirm(null)}>Hủy</button>
            <button className="admin-button primary" disabled={acting} onClick={() => void perform()}>
              {acting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Xác nhận
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
