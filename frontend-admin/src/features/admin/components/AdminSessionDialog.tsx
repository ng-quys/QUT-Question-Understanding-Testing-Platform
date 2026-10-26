import { useEffect, useState } from 'react';
import { Ban, Eye, Loader2, RefreshCw } from 'lucide-react';
import type { SessionDetail, WorkspaceApi } from '../services/adminWorkspaceApi';
import { Badge, Empty, Loading, Modal, Notice, formatDate, labels } from './AdminUI';

export function AdminSessionDialog({
  id,
  api,
  onClose,
  onOpenAttempt,
  onSaved,
}: {
  id: number;
  api: WorkspaceApi;
  onClose: () => void;
  onOpenAttempt?: (attemptId: number) => void;
  onSaved?: (message: string) => void;
}) {
  const [data, setData] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);
  const [activeTab, setActiveTab] = useState<'students' | 'attempts'>('attempts');
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const [revision, setRevision] = useState(0);
  const [actionError, setActionError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api.sessionDetail(id).then(result => { if (active) setData(result); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Không thể tải thông tin ca thi'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, id, revision]);

  async function confirmStatusChange() {
    if (acting || !pendingStatus) return;
    const nextStatus = pendingStatus;
    setActing(true);
    setActionError('');
    try {
      setData(await api.updateSessionStatus(id, nextStatus));
      setPendingStatus(null);
      if (onSaved) onSaved(`Đã cập nhật trạng thái ca thi ${data?.session.roomCode || ""} sang ${labels[nextStatus] || nextStatus}.`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Không thể cập nhật trạng thái');
    } finally {
      setActing(false);
    }
  }

  const s = data?.session;

  return (
    <Modal
      title={s?.name || 'Chi tiết ca thi'}
      description={s ? `${s.examTitle} (${s.examCode}) · Học phần ${s.courseCode}` : 'Thông tin ca thi và danh sách sinh viên.'}
      onClose={onClose}
      wide
      busy={acting}
    >
      <div className="admin-modal-body admin-detail">
        {actionError && <Notice onClose={() => setActionError('')}>{actionError}</Notice>}
        {loading ? (
          <Loading text="Đang tải dữ liệu ca thi..." />
        ) : error ? (
          <Empty
            title="Chưa thể tải dữ liệu ca thi"
            description={error}
            action={
              <button className="admin-button secondary" onClick={() => setRevision(previous => previous + 1)}>
                <RefreshCw size={15} /> Thử lại
              </button>
            }
          />
        ) : data && s ? (
          <>
            {/* Header info banner */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid var(--admin-border)',
                borderRadius: 'var(--admin-radius)',
                padding: '18px 20px',
                marginBottom: '20px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '16px',
              }}
            >
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--admin-text-subtle)', textTransform: 'uppercase' }}>
                  Mã ca thi
                </span>
                <div style={{ marginTop: '4px' }}>
                  <code className="admin-code" style={{ fontSize: '15px', fontWeight: 800 }}>
                    {s.roomCode}
                  </code>
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--admin-text-subtle)', textTransform: 'uppercase' }}>
                  Thời gian thi
                </span>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--admin-text-main)', marginTop: '4px' }}>
                  {formatDate(s.startTime)}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--admin-text-muted)' }}>Đến {formatDate(s.endTime)}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--admin-text-subtle)', textTransform: 'uppercase' }}>
                  Trạng thái ca thi
                </span>
                <div style={{ marginTop: '4px' }}>
                  <Badge status={s.status} />
                </div>
              </div>
              <div>
                <span className="admin-field-label">
                  Thao tác khẩn cấp
                </span>
                <div style={{ marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {s.status !== 'cancelled' && s.status !== 'completed' && (
                    <button
                      className="admin-button secondary small admin-danger"
                      disabled={acting}
                      aria-label={`Hủy ca thi ${s.roomCode}`}
                      title="Hủy ca thi — cần xác nhận"
                      onClick={() => setPendingStatus('cancelled')}
                    >
                      {acting && pendingStatus === 'cancelled' ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />} Hủy ca thi
                    </button>
                  )}
                  {s.status === 'ongoing' && (
                    <button
                      className="admin-button secondary small"
                      disabled={acting}
                      aria-label={`Kết thúc ca thi ${s.roomCode}`}
                      title="Kết thúc ca thi — cần xác nhận"
                      onClick={() => setPendingStatus('completed')}
                    >
                      Kết thúc ca
                    </button>
                  )}
                  {(s.status === 'cancelled' || s.status === 'completed') && (
                    <span style={{ fontSize: '12px', color: 'var(--admin-text-muted)' }}>Đã đóng</span>
                  )}
                </div>
              </div>
            </div>

            {pendingStatus && (
              <div className="admin-confirm-inline" role="alertdialog" aria-label="Xác nhận đổi trạng thái ca thi" onKeyDown={e => { if (e.key === 'Escape') setPendingStatus(null); }}>
                <div>
                  <strong>{pendingStatus === 'cancelled' ? 'Hủy ca thi này?' : 'Kết thúc ca thi này?'}</strong>
                  <p>
                    {pendingStatus === 'cancelled'
                      ? 'Ca thi sẽ đóng nhận người tham gia. Chỉ thực hiện khi không còn bài đang làm; hệ thống giữ nguyên bài đã nộp và ghi nhật ký.'
                      : `Ca thi sẽ chuyển sang trạng thái ${labels[pendingStatus] || pendingStatus}. Chỉ thực hiện khi không còn bài đang làm. Thao tác được ghi nhật ký.`}
                  </p>
                </div>
                <div className="admin-confirm-actions">
                  <button type="button" className="admin-button secondary small" disabled={acting} onClick={() => setPendingStatus(null)}>Giữ nguyên</button>
                  <button type="button" className="admin-button primary small" disabled={acting} autoFocus onClick={() => void confirmStatusChange()}>
                    {acting ? <Loader2 size={13} className="animate-spin" /> : null} Xác nhận
                  </button>
                </div>
              </div>
            )}

            {/* Quick stats */}
            <div className="admin-detail-stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <div>
                <span>Sinh viên đăng ký</span>
                <strong>{data.students.length}</strong>
              </div>
              <div>
                <span>Lượt làm bài thi</span>
                <strong>{data.attempts.length}</strong>
              </div>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--admin-border)', marginBottom: '16px' }}>
              <button
                type="button"
                className="admin-button ghost"
                style={{
                  borderRadius: 0,
                  borderBottom: activeTab === 'attempts' ? '2px solid var(--admin-primary)' : '2px solid transparent',
                  color: activeTab === 'attempts' ? 'var(--admin-primary)' : 'var(--admin-text-muted)',
                  fontWeight: activeTab === 'attempts' ? 700 : 500,
                }}
                onClick={() => setActiveTab('attempts')}
              >
                Bài làm của sinh viên ({data.attempts.length})
              </button>
              <button
                type="button"
                className="admin-button ghost"
                style={{
                  borderRadius: 0,
                  borderBottom: activeTab === 'students' ? '2px solid var(--admin-primary)' : '2px solid transparent',
                  color: activeTab === 'students' ? 'var(--admin-primary)' : 'var(--admin-text-muted)',
                  fontWeight: activeTab === 'students' ? 700 : 500,
                }}
                onClick={() => setActiveTab('students')}
              >
                Danh sách đăng ký ({data.students.length})
              </button>
            </div>

            {/* Tab content */}
            {activeTab === 'attempts' ? (
              data.attempts.length === 0 ? (
                <Empty title="Chưa có lượt làm bài" description="Chưa có sinh viên nào vào làm bài trong ca thi này." />
              ) : (
                <div className="admin-table-scroll" style={{ maxHeight: '340px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--admin-border)', color: '#64748b' }}>
                        <th style={{ padding: '10px 14px', textAlign: 'left' }}>Sinh viên</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left' }}>Bắt đầu</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center' }}>Điểm số</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center' }}>Cảnh báo</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center' }}>Trạng thái</th>
                        {onOpenAttempt && <th style={{ padding: '10px 14px', textAlign: 'right' }}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {data.attempts.map(a => (
                        <tr key={a.id} style={{ borderBottom: '1px solid var(--admin-border-subtle)' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <strong>{a.studentName}</strong>
                            <div style={{ fontSize: '11px', color: 'var(--admin-text-muted)' }}>{a.username}</div>
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: '12px' }}>{formatDate(a.startedAt)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800 }}>
                            {a.score !== null ? `${a.score}/${a.totalPoints}` : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <span className={`admin-tag ${a.eventCount > 0 ? 'amber' : ''}`}>
                              {a.eventCount} sự kiện
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <Badge status={a.status} />
                          </td>
                          {onOpenAttempt && (
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                              <button
                                className="admin-button secondary small"
                                onClick={() => {
                                  onClose();
                                  onOpenAttempt(a.id);
                                }}
                              >
                                <Eye size={13} /> Xem
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : data.students.length === 0 ? (
              <Empty title="Chưa có sinh viên đăng ký" description="Ca thi chưa được gán sinh viên hoặc danh sách lớp rỗng." />
            ) : (
              <div className="admin-table-scroll" style={{ maxHeight: '340px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--admin-border)', color: '#64748b' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Họ và tên</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Tài khoản</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Email</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Khoa / đơn vị</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map(std => (
                      <tr key={std.id} style={{ borderBottom: '1px solid var(--admin-border-subtle)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{std.fullName}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <code className="admin-code">{std.username}</code>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--admin-text-muted)' }}>{std.email}</td>
                        <td style={{ padding: '10px 14px' }}>{std.department || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </div>
      <footer>
        <button type="button" className="admin-button secondary" disabled={acting} onClick={onClose}>
          Đóng
        </button>
      </footer>
    </Modal>
  );
}
