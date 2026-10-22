import { AttemptRiskStats } from './AttemptRiskStats';
import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Save, ShieldAlert } from 'lucide-react';
import { EvidenceTimeline } from '@shared/features/evidence/components/EvidenceTimeline';
import type { AntiCheatSummary, AttemptDetail } from '../services/adminService';
import type { Review, WorkspaceApi } from '../services/adminWorkspaceApi';
import { Badge, Empty, formatDate, labels, Loading, Modal, Notice, reviewOptions } from './AdminUI';

export function AdminAttemptDialog({ id, api, onClose, onSaved }: { id: number; api: WorkspaceApi; onClose: () => void; onSaved: () => void }) {
  const [detail, setDetail] = useState<AttemptDetail | null>(null), [summary, setSummary] = useState<AntiCheatSummary | null>(null), [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState(''), [success, setSuccess] = useState(''), [saving, setSaving] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; setError(''); setDetail(null); Promise.all([api.attempt(id), api.antiCheat(id), api.review(id)]).then(([attempt, anti, result]) => { if (active) { setDetail(attempt); setSummary(anti); setReview(result); } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Không thể tải chi tiết'); }); return () => { active = false; }; }, [api, id, retry]);
  async function save() {
    if (!review || saving) return; setSaving(true); setError(''); setSuccess('');
    try { setReview(await api.saveReview(id, review)); setSuccess('Đã lưu đánh giá và ghi nhật ký quản trị.'); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể lưu đánh giá'); }
    finally { setSaving(false); }
  }
  return <Modal title={`Chi tiết lượt thi #${id}`} description={detail ? `${detail.attempt.studentName} · ${detail.attempt.studentUsername}` : 'Điểm số, diễn biến giám sát và đánh giá của quản trị viên.'} wide onClose={onClose} busy={saving}>
    <div className="admin-modal-body admin-detail">
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}{success && <Notice tone="success" onClose={() => setSuccess('')}>{success}</Notice>}
      {!detail ? error ? <Empty title="Chưa tải được lượt thi" action={<button className="admin-button secondary" onClick={() => setRetry(previous => previous + 1)}><RefreshCw size={16} />Thử lại</button>} /> : <Loading /> : <>
        <div className="admin-attempt-heading"><div><span className="admin-eyebrow">{detail.attempt.examCode}</span><h3>{detail.attempt.examTitle}</h3><p>Bắt đầu {formatDate(detail.attempt.startedAt)} · Nộp {formatDate(detail.attempt.submittedAt)}</p></div><Badge status={detail.attempt.status} /></div>
        <AttemptRiskStats score={detail.attempt.score} totalPoints={detail.attempt.totalPoints} browserEvents={detail.attempt.browserEvents} aiEvents={summary?.aiEvents} riskScore={summary?.riskScore} riskLevel={summary?.riskLevel}/>
        <section className="admin-review"><div className="admin-section-title"><ShieldAlert size={20} /><div><h3>Xem xét cảnh báo</h3><p>Cảnh báo là tín hiệu hỗ trợ kiểm tra. Đánh giá này không tự thay đổi điểm thi.</p></div></div>{review && <><div className="admin-form-grid"><label>Kết quả xem xét<select value={review.outcome} disabled={saving} onChange={event => setReview({ ...review, outcome: event.target.value as Review['outcome'] })}>{reviewOptions.map(outcome => <option key={outcome} value={outcome}>{labels[outcome]}</option>)}</select></label><div className="admin-review-by"><span>Cập nhật gần nhất</span><strong>{review.reviewerName || 'Chưa có đánh giá'}</strong><small>{formatDate(review.updatedAt)}</small></div><label className="full">Ghi chú xử lý<textarea rows={3} maxLength={4000} disabled={saving} placeholder="Nội dung đã kiểm tra, bằng chứng liên quan và hướng xử lý..." value={review.note} onChange={event => setReview({ ...review, note: event.target.value })} /><small>{review.note.length}/4000 ký tự</small></label></div><button className="admin-button primary" disabled={saving} onClick={save}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Lưu đánh giá</button></>}</section>
        <EvidenceTimeline attemptId={id} audience="admin" api={api.evidenceApi} />
      </>}
    </div><footer><button className="admin-button secondary" disabled={saving} onClick={onClose}>Đóng chi tiết</button></footer>
  </Modal>;
}
