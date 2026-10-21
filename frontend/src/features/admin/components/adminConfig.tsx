import { Activity, BarChart3, BookOpen, CalendarClock, Coins, FileClock, GraduationCap, LayoutDashboard, ShieldAlert, Users } from 'lucide-react';
import type { AdminTab, DataRow } from '../services/adminWorkspaceApi';
import { Badge, decimal, formatDate, labels, number, value, type Column } from './AdminUI';

// ────────────────────────────────────────────────────────────
// Sidebar navigation structure
// ────────────────────────────────────────────────────────────

export interface SidebarItem {
  id: AdminTab;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  description: string;
  group?: string;
  groupId?: string; // for collapsible groups
  children?: SidebarItem[]; // sub-items (rendered inline when group expanded)
}

export const sidebarStructure: Array<SidebarItem | { groupId: string; label: string; icon: React.ComponentType<{ size?: number }>; description: string; children: SidebarItem[] }> = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard, description: 'Theo dõi số liệu vận hành và trạng thái dịch vụ.' },
  {
    groupId:'organization',label:'Phòng thi & lớp',icon:CalendarClock,
    description:'Quản lý phòng, lớp hành chính và tổ chức ca thi.',
    children:[
      {id:'organization',label:'Phòng thi',icon:CalendarClock,description:'Quản lý phòng thi và sức chứa.'},
      {id:'studentClasses',label:'Lớp hành chính',icon:GraduationCap,description:'Quản lý lớp hành chính và khoa của sinh viên.'},
      {id:'sessions',label:'Tạo ca thi',icon:CalendarClock,description:'Chọn môn và khoa, chia nhóm dự thi và bổ sung phân công.'},
      {id:'sessionList',label:'Danh sách ca thi',icon:FileClock,description:'Tra cứu ca thi, danh sách dự thi, đề thi và trạng thái công bố.'},
    ],
  },
  { id: 'accounts', label: 'Tài khoản', icon: Users, description: 'Quản lý tài khoản sinh viên, giảng viên và phân quyền.' },
  { id: 'aiCredits', label: 'AI Credits', icon: Coins, description: 'Quản lý hạn mức, cấp thêm credits và lịch sử sử dụng AI của giảng viên.' },
  {
    groupId: 'examination',
    label: 'Khảo thí',
    icon: BookOpen,
    description: 'Học phần, đề thi và ca thi.',
    children: [
      { id: 'courses', label: 'Học phần', icon: BookOpen, description: 'Quản lý học phần, đề thi và ca thi.' },
    ],
  },
  { id: 'liveSessions', label: 'Giám sát ca thi', icon: Activity, description: 'Theo dõi tất cả ca đã công bố đang diễn ra và tình hình sinh viên dự thi.' },
  { id: 'monitor', label: 'Cảnh báo ca thi', icon: ShieldAlert, description: 'Xem ca thi có cảnh báo, sinh viên liên quan và đánh giá hậu kiểm.' },
  { id: 'reports', label: 'Báo cáo', icon: BarChart3, description: 'Phân tích kết quả theo học phần, ca thi và thời gian.' },
  { id: 'audit', label: 'Nhật ký quản trị', icon: FileClock, description: 'Tra cứu ai thay đổi gì, lúc nào.' },
] as const;

// Flat list for breadcrumb lookups etc.
export const adminTabs = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard, description: 'Theo dõi số liệu vận hành và trạng thái dịch vụ.' },
  {id:'organization',label:'Phòng thi',icon:CalendarClock,description:'Quản lý phòng thi và sức chứa.'},
  {id:'studentClasses',label:'Lớp hành chính',icon:GraduationCap,description:'Quản lý lớp hành chính và khoa của sinh viên.'},
  {id:'sessionList',label:'Danh sách ca thi',icon:FileClock,description:'Tra cứu ca thi, danh sách dự thi, đề thi và trạng thái công bố.'},
  { id: 'accounts', label: 'Tài khoản', icon: Users, description: 'Quản lý tài khoản sinh viên, giảng viên và phân quyền.' },
  { id: 'courses', label: 'Học phần', icon: BookOpen, description: 'Quản lý học phần, đề thi và ca thi.' },
  { id: 'exams', label: 'Đề thi', icon: FileClock, description: 'Theo dõi đề thi và cấu hình giám sát AI.' },
  { id: 'sessions', label: 'Tạo ca thi', icon: CalendarClock, description: 'Chọn môn và khoa, chia nhóm dự thi và bổ sung phân công.' },
  { id: 'liveSessions', label: 'Giám sát ca thi', icon: Activity, description: 'Theo dõi tất cả ca đã công bố đang diễn ra và tình hình sinh viên dự thi.' },
  { id: 'monitor', label: 'Cảnh báo ca thi', icon: ShieldAlert, description: 'Xem ca thi có cảnh báo, sinh viên liên quan và đánh giá hậu kiểm.' },
  { id: 'reports', label: 'Báo cáo', icon: BarChart3, description: 'Phân tích kết quả theo học phần, ca thi và thời gian.' },
  { id: 'audit', label: 'Nhật ký quản trị', icon: FileClock, description: 'Tra cứu ai thay đổi gì, lúc nào.' },
  // Legacy tabs kept for any deep-link compatibility
  { id: 'aiCredits', label: 'AI Credits', icon: Coins, description: 'Quản lý hạn mức, cấp thêm credits và lịch sử sử dụng AI của giảng viên.' },
  { id: 'users', label: 'Tất cả tài khoản', icon: Users, description: '' },
  { id: 'students', label: 'Sinh viên', icon: GraduationCap, description: '' },
  { id: 'teachers', label: 'Giảng viên', icon: BookOpen, description: '' },
  { id: 'attempts', label: 'Lượt thi', icon: Activity, description: '' },
  { id: 'anti', label: 'Giám sát & cảnh báo', icon: ShieldAlert, description: '' },
] as const;

// ── In-page sub-tabs ────────────────────────────────────────

export interface SubTab { id: string; label: string; apiRole?: string }

export const accountSubTabs: SubTab[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'student', label: 'Sinh viên', apiRole: 'student' },
  { id: 'teacher', label: 'Giảng viên', apiRole: 'teacher' },
];

export const monitorSubTabs: SubTab[] = [
  { id: 'warned', label: 'Ca thi có cảnh báo' },
];

// ── Helpers ──────────────────────────────────────────────────

export const statuses: Partial<Record<AdminTab, string[]>> = {
  users: ['active', 'inactive', 'locked'],
  accounts: ['active', 'inactive', 'locked'],
  students: ['active', 'inactive', 'locked'],
  teachers: ['active', 'inactive', 'locked'],
  courses: ['active', 'inactive'],
  exams: ['draft', 'upcoming', 'ongoing', 'completed', 'cancelled'],
  sessions: ['scheduled', 'ongoing', 'completed', 'cancelled'],
  attempts: ['in_progress', 'submitted', 'completed', 'expired'],
  anti: ['in_progress', 'submitted', 'completed', 'expired'],
  monitor: ['in_progress', 'submitted', 'completed', 'expired'],
};

export const isAccount = (tab: AdminTab) => ['users', 'students', 'teachers', 'accounts'].includes(tab);
export const isAttempt = (tab: AdminTab) => ['attempts', 'anti', 'reports', 'monitor'].includes(tab);
export const initials = (name: string) => name.trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase();
const cell = (title: string, subtitle?: string) => <div className="admin-cell-title"><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</div>;
const stateColumn: Column = { key: 'status', title: 'Trạng thái', render: row => <Badge status={value(row, 'status')} /> };
const auditActions: Record<string, string> = { CREATE_USER: 'Tạo tài khoản', UPDATE_USER: 'Cập nhật tài khoản', RESET_PASSWORD: 'Đặt lại mật khẩu', UPDATE_USER_STATUS: 'Đổi trạng thái tài khoản', REVIEW_ATTEMPT: 'Xem xét lượt thi', UPDATE_SESSION_STATUS: 'Đổi trạng thái ca thi', UPDATE_AI_POLICY: 'Đổi giám sát AI', CREATE_COURSE:'Tạo học phần',UPDATE_COURSE:'Sửa học phần',DELETE_COURSE:'Xóa học phần',CREATE_EXAM:'Tạo đề thi',UPDATE_EXAM:'Sửa đề thi',DELETE_EXAM:'Xóa đề thi',CREATE_SESSION:'Tạo ca thi',UPDATE_SESSION:'Sửa ca thi',DELETE_SESSION:'Xóa ca thi' };
const auditTargets: Record<string, string> = { USER: 'Tài khoản', ATTEMPT: 'Lượt thi', SESSION: 'Ca thi', EXAM: 'Đề thi', COURSE: 'Học phần' };

export function dataColumns(tab: AdminTab): Column[] {
  if (isAccount(tab)) return [{ key: 'fullName', title: 'Tài khoản', render: row => <div className="admin-person"><span className="admin-avatar">{initials(value(row, 'fullName'))}</span>{cell(value(row, 'fullName'), `${['teacher','faculty'].includes(value(row,'role'))?'Mã GV: ':value(row,'role')==='student'?'Mã SV: ':''}${!/^[0-9]{10}$/.test(value(row,'username'))&&['teacher','faculty','student'].includes(value(row,'role'))?'Chưa cấp mã':value(row,'username')}`)}</div> }, { key: 'email', title: 'Email' }, { key: 'role', title: 'Vai trò', render: row => <span className="admin-tag">{labels[value(row, 'role')] || value(row, 'role')}</span> }, { key: 'department', title: 'Khoa / Lớp', render: row => cell(value(row,'department'),value(row,'role')==='student'?(row.classCode?`Lớp ${value(row,'classCode')}`:'Chưa phân lớp'):'') }, stateColumn];
  if (tab === 'courses') return [{ key: 'code', title: 'Học phần', render: row => cell(value(row, 'name'), value(row, 'code')) }, { key: 'department', title: 'Khoa / đơn vị' }, { key: 'examCount', title: 'Đề thi', numeric: true }, { key: 'sessionCount', title: 'Ca thi', numeric: true }, stateColumn];
  if (tab === 'exams') return [{ key: 'title', title: 'Đề thi', render: row => cell(value(row, 'title'), `${value(row, 'code')} · ${value(row, 'courseCode')}`) }, { key: 'totalQuestions', title: 'Số câu', numeric: true }, { key: 'sessionCount', title: 'Ca thi', numeric: true }, stateColumn];
  if (tab === 'sessions') return [{ key: 'name', title: 'Ca thi / đề thi', render: row => cell(row.name?String(row.name):value(row,'examTitle'), `${value(row,'examCode')} · ${value(row,'examTitle')}`) }, { key: 'className', title: 'Lớp' }, { key: 'roomCode', title: 'Mã ca thi', render: row => <code className="admin-code">{value(row, 'roomCode')}</code> }, { key: 'startTime', title: 'Thời gian', render: row => cell(formatDate(value(row, 'startTime')), `Đến ${formatDate(value(row, 'endTime'))}`) }, { key: 'registeredCount', title: 'Đăng ký', numeric: true }, { key: 'attemptCount', title: 'Lượt thi', numeric: true }, stateColumn];
  if (tab === 'audit') return [{ key: 'createdAt', title: 'Thời gian', render: row => formatDate(value(row, 'createdAt')) }, { key: 'actorUsername', title: 'Người thực hiện' }, { key: 'action', title: 'Hành động', render: row => <span className="admin-tag" title={value(row, 'action')}>{auditActions[value(row, 'action')] || value(row, 'action')}</span> }, { key: 'targetId', title: 'Đối tượng', render: row => `${auditTargets[value(row, 'targetType')] || value(row, 'targetType')} #${value(row, 'targetId')}` }, { key: 'detail', title: 'Chi tiết', render: row => <span className="admin-audit-detail">{value(row, 'detail')}</span> }];
  // attempts / anti / monitor / reports
  const isWarnedView = tab === 'anti' || tab === 'monitor';
  const isReportView = tab === 'reports';
  return [
    { key: 'studentName', title: 'Sinh viên', render: row => cell(value(row, 'studentName'), `${value(row, 'studentUsername')} · Lượt #${row.id}`) },
    { key: 'examCode', title: 'Bài thi', render: row => cell(value(row, 'examCode'), `${value(row, 'courseCode')} · Ca ${value(row,'sessionCode')}`) },
    { key: 'startedAt', title: isReportView ? 'Nộp bài' : 'Bắt đầu', render: row => formatDate(value(row, isReportView ? 'submittedAt' : 'startedAt')) },
    { key: 'score', title: 'Điểm', numeric: true, render: row => row.score == null ? '—' : <strong className="admin-score">{decimal(number(row, 'score'))}<small>/{decimal(number(row, 'totalPoints'))}</small></strong> },
    { key: 'browserEvents', title: 'Cảnh báo', render: row => <span className={`admin-tag ${number(row, 'browserEvents') + number(row, 'aiEvents') ? 'amber' : ''}`}>{number(row, 'browserEvents')} trình duyệt · {number(row, 'aiEvents')} AI</span> },
    isWarnedView
      ? { key: 'reviewOutcome', title: 'Xem xét', render: (row: DataRow) => <Badge status={value(row, 'reviewOutcome')} /> }
      : stateColumn,
  ];
}
