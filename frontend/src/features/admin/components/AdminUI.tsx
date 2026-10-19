import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Inbox, Loader2, RefreshCw, X } from 'lucide-react';
import type { DataRow, Page } from '../services/adminWorkspaceApi';
import { useBodyScrollLock } from './adminAccessibility';

export const labels: Record<string, string> = { active: 'Hoạt động', inactive: 'Ngưng hoạt động', locked: 'Đã khóa', scheduled: 'Đã lên lịch', upcoming: 'Sắp diễn ra', ongoing: 'Đang diễn ra', completed: 'Hoàn thành', submitted: 'Đã nộp', in_progress: 'Đang làm bài', expired: 'Hết hạn', cancelled: 'Đã hủy', draft: 'Bản nháp', published: 'Đã phát hành', open: 'Đang mở', closed: 'Đã đóng', student: 'Sinh viên', teacher: 'Giảng viên', faculty: 'Giảng viên', admin: 'Quản trị viên', unreviewed: 'Chưa xem xét', needs_review: 'Cần xem lại', cleared: 'Không phát hiện bất thường', flagged: 'Ghi nhận bất thường', LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', CRITICAL: 'Rất cao' };
export const reviewOptions = ['unreviewed', 'needs_review', 'cleared', 'flagged'] as const;
export const value = (row: DataRow, key: string) => row[key] == null ? '—' : String(row[key]);
export const number = (row: DataRow, key: string) => Number(row[key] ?? 0);
export const formatDate = (input?: string | null) => input ? new Date(input).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const decimal = (input: number) => Number(input).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
export function Badge({ status }: { status: string }) {
  const tone = ['active', 'completed', 'submitted', 'cleared', 'LOW', 'open'].includes(status) ? 'green' : ['locked', 'cancelled', 'expired', 'flagged', 'HIGH', 'CRITICAL'].includes(status) ? 'red' : ['needs_review', 'MEDIUM', 'in_progress', 'ongoing'].includes(status) ? 'amber' : 'neutral';
  return <span className={`admin-badge ${tone}`}><i />{labels[status] || status || '—'}</span>;
}
export function Modal({ title, description, onClose, children, wide = false, busy = false }: { title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useBodyScrollLock(true);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    // Focus the dialog close button first for keyboard users; fall back to dialog itself.
    const target = dialog.querySelector<HTMLElement>('[data-autofocus]') ?? dialog;
    // requestAnimationFrame keeps focus stable across showModal transitions.
    const frame = requestAnimationFrame(() => target.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      try { dialog.close(); } catch { /* already closed */ }
      previous?.focus?.({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className={`admin-modal ${wide ? 'wide' : ''}`} aria-labelledby={id} aria-modal="true" onClick={e => { if (e.target === ref.current && !busy) onClose(); }} onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); if (!busy) onClose(); } }}>
    <header><div><h2 id={id} tabIndex={-1}>{title}</h2>{description && <p>{description}</p>}</div><button type="button" className="admin-icon" data-autofocus disabled={busy} aria-label="Đóng hộp thoại" title="Đóng (Esc)" onClick={onClose}><X size={18} /></button></header>{children}
  </dialog>;
}
export function Notice({ children, onClose, tone = 'error' }: { children: ReactNode; onClose?: () => void; tone?: 'error' | 'success' | 'info' }) {
  return <div className={`admin-notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}><AlertCircle size={18} /><span>{children}</span>{onClose && <button className="admin-icon" aria-label="Đóng thông báo" onClick={onClose}><X size={16} /></button>}</div>;
}
export function Empty({ title = 'Chưa có dữ liệu', description = 'Thử thay đổi bộ lọc hoặc tải lại danh sách.', action }: { title?: string; description?: string; action?: ReactNode }) {
  return <div className="admin-empty"><span><Inbox size={28} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function Loading({ text = 'Đang tải dữ liệu...' }: { text?: string }) { return <div className="admin-loading" role="status"><Loader2 size={23} className="animate-spin" /><span>{text}</span></div>; }
export interface Column { key: string; title: string; render?: (row: DataRow) => ReactNode; numeric?: boolean }
export function DataTable({ columns, page, loading, onPage, onSize, error, onRetry }: { columns: Column[]; page: Page; loading: boolean; onPage: (page: number) => void; onSize: (size: number) => void; error?: string; onRetry?: () => void }) {
  const totalPages = Math.max(1, Math.ceil(page.total / page.size));
  const showTable = !loading && !error && page.items.length > 0;
  return <div className="admin-table-panel" aria-busy={loading}>
    {loading ? <Loading /> : showTable ? <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu, có thể cuộn ngang"><table><thead><tr>{columns.map(column => <th key={column.key} className={column.numeric ? 'numeric' : ''} scope="col">{column.title}</th>)}</tr></thead><tbody>{page.items.map(row => <tr key={number(row, 'id')}>{columns.map(column => <td key={column.key} className={column.numeric ? 'numeric' : ''}>{column.render ? column.render(row) : value(row, column.key)}</td>)}</tr>)}</tbody></table></div> : error ? <Empty title="Chưa tải được dữ liệu" description={error} action={onRetry ? <button className="admin-button secondary" onClick={onRetry}><RefreshCw size={15} />Thử lại</button> : undefined} /> : <Empty />}
    <footer className="admin-pagination"><span>{loading ? 'Đang cập nhật danh sách…' : error ? 'Chưa có dữ liệu để hiển thị' : `${page.total ? `${page.page * page.size + 1}–${Math.min((page.page + 1) * page.size, page.total)}` : '0'} / ${page.total.toLocaleString('vi-VN')} bản ghi`}</span><label>Số dòng<select aria-label="Số dòng mỗi trang" value={page.size} onChange={event => onSize(Number(event.target.value))} disabled={loading || !!error}>{[10, 20, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label><div><button className="admin-icon" disabled={loading || !!error || page.page === 0} aria-label="Trang trước" title="Trang trước" onClick={() => onPage(page.page - 1)}><ChevronLeft size={18} /></button><span>Trang {page.page + 1}/{totalPages}</span><button className="admin-icon" disabled={loading || !!error || page.page + 1 >= totalPages} aria-label="Trang tiếp" title="Trang tiếp" onClick={() => onPage(page.page + 1)}><ChevronRight size={18} /></button></div></footer>
  </div>;
}
export function csvCell(input: unknown) {
  let text = input == null ? '' : String(input);
  if (typeof input === 'string' && /^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function downloadCsv(name: string, headers: string[], rows: unknown[][]) {
  const blob = new Blob(['\uFEFF' + [headers.map(csvCell).join(','), ...rows.map(row => row.map(csvCell).join(','))].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
