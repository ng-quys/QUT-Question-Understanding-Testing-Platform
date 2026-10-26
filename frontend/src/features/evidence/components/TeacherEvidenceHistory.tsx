import { useEffect, useRef, useState } from 'react';
import { Search, X, RefreshCw } from 'lucide-react';
import { evidenceApi, type HistoryAttempt } from '@shared/features/evidence/services/evidenceApi';
import { EvidenceTimeline } from '@shared/features/evidence/components/EvidenceTimeline';

const date = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN') : 'Chưa nộp bài';
const statuses: Record<string, string> = { in_progress: 'Đang làm bài', submitted: 'Đã nộp', graded: 'Đã chấm', expired: 'Hết giờ', completed: 'Hoàn thành' };
export function TeacherEvidenceHistory() {
  const [query, setQuery] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(0), [reload, setReload] = useState(0);
  const [rows, setRows] = useState<HistoryAttempt[]>([]), [total, setTotal] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [selected, setSelected] = useState<HistoryAttempt | null>(null);
  useEffect(() => { let active = true; setLoading(true); setError(''); evidenceApi.history(page, search).then(result => { if (active) { setRows(result.items); setTotal(result.total); } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Không tải được lịch sử thi'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [page, search, reload]);
  return <section className="evidence-history"><div className="evidence-heading"><div><h3>Lịch sử thi & ảnh bằng chứng</h3><p>Các lượt thi thuộc học phần bạn phụ trách · {total} lượt thi</p></div><button className="evidence-button" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={15} />Làm mới</button></div>
    <form className="evidence-history-search" onSubmit={event => { event.preventDefault(); setPage(0); setSearch(query.trim()); setReload(value => value + 1); }}><input aria-label="Tìm lịch sử thi" placeholder="Tên sinh viên, mã sinh viên, đề hoặc học phần..." maxLength={160} value={query} onChange={event => setQuery(event.target.value)} /><button className="evidence-button" type="submit"><Search size={16} />Tìm kiếm</button></form>
    {error ? <div className="evidence-error" role="alert">{error}<button className="evidence-button" onClick={() => setReload(value => value + 1)}>Thử lại</button></div> : loading ? <div className="evidence-empty" role="status">Đang tải lịch sử thi...</div> : !rows.length ? <div className="evidence-empty">Chưa có lượt thi phù hợp trong các học phần bạn phụ trách.</div> : <div className="evidence-history-table"><table><thead><tr><th>Sinh viên</th><th>Đề / Học phần</th><th>Thời gian</th><th>Kết quả</th><th /></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><strong>{row.studentName}</strong><small>{row.studentUsername}</small></td><td>{row.examTitle}<small>{row.courseCode} · {row.sessionId ? `Ca #${row.sessionId}` : 'Thi theo đề'}</small></td><td>{date(row.startedAt)}<small>{date(row.submittedAt)}</small></td><td>{row.score == null ? 'Chưa có điểm' : `${row.score}/${row.totalPoints}`}<small>{statuses[row.status] || row.status}</small></td><td><button className="evidence-button" onClick={() => setSelected(row)}>Xem lượt thi</button></td></tr>)}</tbody></table></div>}
    {total > 20 && <div className="evidence-pagination"><button className="evidence-button" disabled={loading || !page} onClick={() => setPage(value => value - 1)}>Trước</button><span>Trang {page + 1}/{Math.ceil(total / 20)}</span><button className="evidence-button" disabled={loading || (page + 1) * 20 >= total} onClick={() => setPage(value => value + 1)}>Tiếp</button></div>}
    {selected && <AttemptDialog attempt={selected} onClose={() => setSelected(null)} />}
  </section>;
}
function AttemptDialog({ attempt, onClose }: { attempt: HistoryAttempt; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="evidence-viewer evidence-attempt-dialog" aria-label="Chi tiết lịch sử thi" onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}><header><div><h2>{attempt.studentName} · Lượt thi #{attempt.id}</h2><p>{attempt.examTitle} · {attempt.courseCode} · {date(attempt.startedAt)}</p></div><button className="evidence-button" onClick={onClose} aria-label="Đóng chi tiết lượt thi"><X size={19} /></button></header><div className="evidence-attempt-content"><EvidenceTimeline attemptId={attempt.id} audience="teacher" /></div></dialog>;
}
