import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, ChevronLeft, ChevronRight, Clock3, Loader2, RefreshCw, X } from 'lucide-react';
import { evidenceApi, type EvidenceAudience, type EvidenceEvent, type EvidencePage } from '../services/evidenceApi';
import '../styles/evidence.css';

const date = (time: string) => new Date(time).toLocaleString('vi-VN');
const descriptions: Record<string, string> = { pending: 'Đang chờ tải ảnh lên', uploaded: 'Ảnh trên Storage', failed: 'Tải ảnh thất bại', local: 'Ảnh local cũ', none: 'Không có ảnh' };
const eventNames: Record<string, string> = { TAB_HIDDEN: 'Rời tab bài thi', FULLSCREEN_EXIT: 'Thoát toàn màn hình', WINDOW_BLUR: 'Cửa sổ thi mất tiêu điểm', SPEECH: 'Phát hiện tiếng nói', MULTIPLE_PERSONS: 'Nhiều người trong khung hình', NO_FACE: 'Không thấy khuôn mặt', FACE_MISMATCH: 'Khuôn mặt không khớp', PHONE: 'Phát hiện điện thoại', IDENTITY_MISMATCH: 'Khuôn mặt không khớp', SPOOF_FACE: 'Cảnh báo kiểm tra khuôn mặt', MULTIPLE_PEOPLE: 'Nhiều người trong khung hình', HEAD_LEFT: 'Quay đầu sang trái', HEAD_RIGHT: 'Quay đầu sang phải', HEAD_UP: 'Ngẩng đầu', HEAD_DOWN: 'Cúi đầu', HOLDING_PHONE: 'Cầm điện thoại', HOLDING_TABLET: 'Cầm máy tính bảng', HOLDING_STUDY_MATERIAL: 'Cầm tài liệu', INTERACTING_LAPTOP: 'Tương tác với máy tính khác', COPY: 'Thao tác sao chép', PASTE: 'Thao tác dán' };

export function EvidenceTimeline({ attemptId, audience, api = evidenceApi }: { attemptId: number; audience: EvidenceAudience; api?: typeof evidenceApi }) {
  const [page, setPage] = useState(0), [reload, setReload] = useState(0), [data, setData] = useState<EvidencePage | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [selected, setSelected] = useState<EvidenceEvent | null>(null);
  useEffect(() => { let active = true; setLoading(true); setError(''); api.events(audience, attemptId, page).then(result => { if (active) setData(result); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Không tải được diễn biến giám sát'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [api, audience, attemptId, page, reload]);
  return <section className="evidence-timeline"><div className="evidence-heading"><div><h3>Diễn biến & ảnh bằng chứng</h3><p>{data?.total ?? 0} sự kiện · Thời gian ghi nhận từ đầu phiên thi</p></div><button className="evidence-button" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={15} />Làm mới</button></div>
    <p className="evidence-disclaimer">Cảnh báo hỗ trợ xem xét, không tự kết luận sinh viên gian lận.</p>
    {error && <div className="evidence-error" role="alert"><AlertCircle size={17} />{error}<button className="evidence-button" onClick={() => setReload(value => value + 1)}>Thử lại</button></div>}
    {loading ? <div className="evidence-empty" role="status"><Loader2 className="animate-spin" size={22} />Đang tải sự kiện...</div> : !error && !data?.items.length ? <div className="evidence-empty"><Camera size={27} /><strong>Chưa có sự kiện giám sát</strong><span>Không có cảnh báo được ghi nhận cho lượt thi này.</span></div> : !error && <div className="evidence-event-list">{data?.items.map(event => <article key={event.id}><span className={`evidence-event-dot ${event.active ? 'active' : ''}`} /><div className="evidence-event-body"><div className="evidence-event-title"><strong>{eventNames[event.event] || event.event}</strong><span>{event.module}</span><span className={`evidence-risk ${event.riskLevel.toLowerCase()}`}>Rủi ro {event.riskScore}/100</span></div><p><Clock3 size={13} />{date(event.occurredAt)} · {event.active ? 'Ghi nhận' : 'Kết thúc'} · {Number(event.duration).toFixed(1)} giây</p><small className={event.evidenceStatus === 'failed' ? 'evidence-failed-text' : ''}>{descriptions[event.evidenceStatus] || 'Chưa có ảnh'}{event.evidenceStatus === 'failed' && ' · Cần kiểm tra và gửi lại từ máy giám sát'}</small></div>{event.hasEvidence && <button className="evidence-button" onClick={() => setSelected(event)}><Camera size={16} />{event.evidenceStatus === 'pending' ? 'Kiểm tra ảnh' : 'Xem bằng chứng'}</button>}</article>)}</div>}
    {data && data.total > 20 && <div className="evidence-pagination"><button className="evidence-button" disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} />Trước</button><span>Trang {page + 1}/{Math.ceil(data.total / 20)}</span><button className="evidence-button" disabled={loading || (page + 1) * 20 >= data.total} onClick={() => setPage(value => value + 1)}>Tiếp<ChevronRight size={16} /></button></div>}
    {selected && <EvidenceViewer key={selected.id} event={selected} attemptId={attemptId} audience={audience} api={api} onClose={() => setSelected(null)} />}
  </section>;
}

export function EvidenceViewer({ event, attemptId, audience, api = evidenceApi, onClose }: { event: EvidenceEvent; attemptId: number; audience: EvidenceAudience; api?: typeof evidenceApi; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), renewed = useRef(false);
  const [source, setSource] = useState(''), [mime, setMime] = useState('image/jpeg'), [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [expired, setExpired] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [version, setVersion] = useState(0);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  useEffect(() => { let active = true; let objectUrl = ''; setLoading(true); setError(''); setSource(''); setExpiresAt(null); setExpired(false);
    async function fetchImage() {
      try {
        const result = await api.link(audience, attemptId, event.id);
        if (!active) return;
        if (result.provider === 'local') { const blob = await api.local(audience, attemptId, event.id); if (!active) return; objectUrl = URL.createObjectURL(blob); setMime(blob.type); setSource(objectUrl); setExpiresAt(null); }
        else { if (!result.url || !result.expiresAt || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error('Liên kết ảnh không hợp lệ'); setMime('image/jpeg'); setSource(result.url); setExpiresAt(result.expiresAt); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Không thể lấy ảnh bằng chứng'); }
      finally { if (active) setLoading(false); }
    }
    void fetchImage(); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [api, attemptId, audience, event.id, version]);
  useEffect(() => { if (!expiresAt) return; const timer = setTimeout(() => setExpired(true), Math.max(0, Date.parse(expiresAt) - Date.now())); return () => clearTimeout(timer); }, [expiresAt]);
  function renew() { renewed.current = false; setVersion(value => value + 1); }
  function imageError() { if (expiresAt && !renewed.current && Date.now() >= Date.parse(expiresAt) - 5000) { renewed.current = true; setVersion(value => value + 1); } else setError('Không tải được ảnh. Ảnh có thể đã bị xóa hoặc kết nối bị gián đoạn.'); }
  return <dialog ref={ref} className="evidence-viewer" onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }} aria-labelledby="evidence-viewer-title" onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}><header><div><h2 id="evidence-viewer-title">Ảnh bằng chứng · Lượt thi #{attemptId}</h2><p>{eventNames[event.event] || event.event} · {date(event.occurredAt)} · Rủi ro {event.riskScore}/100</p></div><button className="evidence-button" aria-label="Đóng ảnh bằng chứng" onClick={onClose}><X size={19} /></button></header><div className="evidence-viewer-body">{loading ? <div className="evidence-empty" role="status"><Loader2 className="animate-spin" />Đang tải ảnh...</div> : error ? <div className="evidence-empty evidence-error" role="alert"><AlertCircle size={25} /><p>{error}</p><button className="evidence-button" onClick={renew}><RefreshCw size={16} />Thử lại</button></div> : source && (mime.startsWith('video/') ? <video controls src={source} /> : mime.startsWith('audio/') ? <audio controls src={source} /> : <img key={version} src={source} onError={imageError} referrerPolicy="no-referrer" alt={`Bằng chứng cảnh báo ${eventNames[event.event] || event.event}, lượt thi ${attemptId}`} />)}</div><footer><span>{expiresAt ? expired ? 'Link xem đã hết hạn. Bạn có thể yêu cầu link mới.' : `Link xem có hiệu lực đến ${new Date(expiresAt).toLocaleTimeString('vi-VN')}.` : event.provider === 'local' ? 'Bằng chứng local cũ · Truy cập qua API được phân quyền.' : 'Link xem chỉ được cấp khi ảnh đã sẵn sàng.'}</span><button className="evidence-button" disabled={loading} onClick={renew}><RefreshCw size={15} />{expired ? 'Lấy link mới' : 'Tải lại ảnh'}</button></footer></dialog>;
}
