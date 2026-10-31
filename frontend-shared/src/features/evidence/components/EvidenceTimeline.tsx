import { reviewPriority } from '../services/reviewPriority';
import { groupEvidenceEvents, type EvidenceGroup } from '../services/evidenceGroups';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, ChevronLeft, ChevronRight, Clock3, Loader2, RefreshCw, X } from 'lucide-react';
import { evidenceApi, type EvidenceAudience, type EvidenceEvent, type EvidencePage } from '../services/evidenceApi';
import '../styles/evidence.css';
import { startVisiblePolling } from '../../../utils/visiblePolling';

const date = (time: string) => new Date(time).toLocaleString('vi-VN');
const descriptions: Record<string, string> = { pending: 'Đang chờ tải ảnh lên', uploaded: 'Ảnh trên Storage', failed: 'Tải ảnh thất bại', local: 'Ảnh local cũ', none: 'Không có ảnh' };
const eventNames: Record<string, string> = { OFFLINE_CAPTURE:'Ảnh lưu ngoại tuyến', PHONE_VISIBLE:'Phát hiện điện thoại', TABLET_VISIBLE:'Phát hiện máy tính bảng', MATERIAL_VISIBLE:'Phát hiện tài liệu', OFFLINE_SUBMISSION_RECEIVED: 'Nhận bản bài làm lưu trên máy · Cần đối chiếu thời gian ngoại tuyến', CAMERA_PERMISSION_DENIED: 'Quyền truy cập camera bị chặn', MONITORING_CONNECTION_LOST: 'Mất kết nối giám sát', CAMERA_DEVICE_UNAVAILABLE: 'Camera mất hình hoặc lỗi thiết bị · Chưa rõ nguyên nhân', CAMERA_IDENTITY_PAUSE: 'Gián đoạn làm bài để xác minh khuôn mặt', CAMERA_NO_FACE_PAUSE: 'Tạm khóa · Không thấy khuôn mặt', CAMERA_LIVENESS_PAUSE: 'Tạm khóa · Chưa xác nhận được người thật', CAMERA_MULTIPLE_PEOPLE_PAUSE: 'Tạm khóa · Nhiều người trong khung hình', CAMERA_IDENTITY_OBSERVATION: 'Khuôn mặt chưa khớp ảnh hồ sơ · Cần xem xét', CAMERA_IDENTITY_LOCK: 'Tạm khóa bài thi · Khuôn mặt chưa khớp ảnh hồ sơ', CAMERA_INTERRUPTED: 'Camera hoặc kết nối giám sát bị gián đoạn', TAB_HIDDEN: 'Rời tab bài thi', FULLSCREEN_EXIT: 'Thoát toàn màn hình', WINDOW_BLUR: 'Cửa sổ thi mất tiêu điểm', SPEECH: 'Phát hiện tiếng nói', MULTIPLE_PERSONS: 'Nhiều người trong khung hình', NO_FACE: 'Không thấy khuôn mặt', FACE_MISMATCH: 'Khuôn mặt không khớp', PHONE: 'Phát hiện điện thoại', IDENTITY_MISMATCH: 'Khuôn mặt không khớp', SPOOF_FACE: 'Cảnh báo kiểm tra khuôn mặt', MULTIPLE_PEOPLE: 'Nhiều người trong khung hình', HEAD_LEFT: 'Quay đầu sang trái', HEAD_RIGHT: 'Quay đầu sang phải', HEAD_UP: 'Ngẩng đầu', HEAD_DOWN: 'Cúi đầu', HOLDING_PHONE: 'Phát hiện điện thoại', HOLDING_TABLET: 'Phát hiện máy tính bảng', HOLDING_STUDY_MATERIAL: 'Phát hiện tài liệu', INTERACTING_LAPTOP: 'Tương tác với máy tính khác', COPY: 'Thao tác sao chép', PASTE: 'Thao tác dán' };

export function EvidenceTimeline({ attemptId, audience, api = evidenceApi }: { attemptId: number; audience: EvidenceAudience; api?: typeof evidenceApi }) {
  const [page, setPage] = useState(0), [reload, setReload] = useState(0), [data, setData] = useState<EvidencePage | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [selected, setSelected] = useState<EvidenceGroup | null>(null);
  const resource = useRef({ key: '', loaded: false });
  useEffect(() => {
    const key = `${audience}:${attemptId}:${page}`;
    if (resource.current.key !== key) {
      resource.current = { key, loaded: false };
      setData(null); setSelected(null);
    }
    let active = true;
    setError(''); setLoading(!resource.current.loaded);
    let stop = () => {};
    stop = startVisiblePolling(async signal => {
      try {
        const result = await api.events(audience, attemptId, page, AbortSignal.any([signal, AbortSignal.timeout(15000)]));
        if (!active || signal.aborted) return;
        resource.current.loaded = true;
        setData(result); setError('');
        // stop() aborts this poll's signal; finish the UI before stopping terminal attempts.
        setLoading(false);
        // Older backends omit status: keep polling until a terminal status is confirmed.
        if ((!result.offlineEvidence||(result.offlineEvidence.intakeComplete&&result.offlineEvidence.pending+result.offlineEvidence.retrying===0)) && result.attemptStatus && ['completed', 'submitted', 'expired', 'cancelled'].includes(result.attemptStatus)) stop();
      } catch (cause) {
        if (active && !signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được diễn biến giám sát');
      } finally {
        if (active && !signal.aborted) setLoading(false);
      }
    }, { interval: 10000 });
    return () => { active = false; stop(); };
  }, [api, audience, attemptId, page, reload]);
  const groups=groupEvidenceEvents(data?.items??[]);
  const groupTotal=data?.groupTotal??data?.total??0;
  const size=data?.size??20;
  return <section className="evidence-timeline"><div className="evidence-heading"><div><h3>Diễn biến & ảnh bằng chứng</h3><p>{data?.total ?? 0} sự kiện · {groupTotal} mục ghi nhận</p></div><button className="evidence-button" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={15} />Làm mới</button></div>
    <p className="evidence-disclaimer">Mức độ cần xem xét hỗ trợ ưu tiên kiểm tra bằng chứng, không phải xác suất gian lận và không trừ điểm bài thi.</p>
    {data?.offlineEvidence&&<div className="evidence-disclaimer" role="status"><strong>Ảnh ngoại tuyến · Hậu kiểm</strong><p>Đã nhận {data.offlineEvidence.received} ảnh · Đã phân tích {data.offlineEvidence.analyzed} · Chờ phân tích {data.offlineEvidence.pending} · Chờ thử lại {data.offlineEvidence.retrying}.</p><p>{data.offlineEvidence.intakeComplete?'Thiết bị đã báo gửi đủ ảnh.':'Đang chờ thiết bị xác nhận gửi đủ ảnh.'} Kết quả hậu kiểm không khóa lại bài hoặc thay đổi điểm bài thi.</p>{data.offlineEvidence.truncated&&<p>Thiết bị báo dừng lưu thêm ảnh do giới hạn hoặc lỗi bộ nhớ. Cần kiểm tra khoảng trống giám sát.</p>}</div>}
    {error && <div className="evidence-error" role="alert"><AlertCircle size={17} />{error}<button className="evidence-button" onClick={() => setReload(value => value + 1)}>Thử lại</button></div>}
    {loading ? <div className="evidence-empty" role="status"><Loader2 className="animate-spin" size={22} />Đang tải sự kiện...</div> : !error && !groups.length ? <div className="evidence-empty"><Camera size={27} /><strong>Chưa có sự kiện giám sát</strong><span>Không có cảnh báo được ghi nhận cho lượt thi này.</span></div> : <div className="evidence-event-list">{groups.map(group => {
      const event=group.imageEvent;
      const findings=group.events.filter(item=>item.event!=='OFFLINE_CAPTURE');
      const shown=findings.length?findings:group.events;
      const offline=event.module==='OFFLINE';
      return <article key={group.key}><span className={`evidence-event-dot ${group.events.some(item=>item.active) ? 'active' : ''}`} /><div className="evidence-event-body"><div className="evidence-event-title"><strong>{shown.length>1?`${shown.length} cảnh báo cùng lần ghi nhận`:eventNames[shown[0].event]||shown[0].event}</strong><span className={`evidence-risk ${group.riskLevel.toLowerCase()}`}>{reviewPriority(group.riskScore)}</span></div>
        <p><Clock3 size={13} />{date(group.occurredAt)}{!offline&&group.events.length===1&&<> · {event.active?'Ghi nhận':'Kết thúc'} · {Number(event.duration).toFixed(1)} giây</>}</p>
        {shown.length>1&&<div className="evidence-warning-labels" aria-label="Các cảnh báo trong cùng khung hình">{shown.map(item=><span key={item.id}>{eventNames[item.event]||item.event}<small>{offline?'Ảnh hậu kiểm':`${item.module} · ${Number(item.duration).toFixed(1)} giây`}{!item.active?' · Kết thúc':''}</small></span>)}</div>}
        {offline&&<p>Ảnh hậu kiểm · Giờ chụp do thiết bị báo cáo, chưa được xác thực. Máy chủ nhận: {event.receivedAt?date(event.receivedAt):'Đang cập nhật'}. {event.analysisStatus==='analyzed'?(findings.length?'Đã phân tích.':'Đã phân tích · Chưa ghi nhận cảnh báo trong ảnh.'):'Đang chờ AI phân tích hoặc thử lại.'}</p>}
        <small className={event.evidenceStatus==='failed'?'evidence-failed-text':''}>{descriptions[event.evidenceStatus]||'Chưa có ảnh'}{event.evidenceStatus==='failed'&&' · Cần kiểm tra và gửi lại từ máy giám sát'}</small>
      </div>{event.hasEvidence&&<button className="evidence-button" onClick={()=>setSelected(group)}><Camera size={16}/>{event.evidenceStatus==='pending'?'Kiểm tra ảnh':'Xem bằng chứng'}</button>}</article>;
    })}</div>}
    {data&&groupTotal>size&&<div className="evidence-pagination"><button className="evidence-button" disabled={loading||page===0} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={16}/>Trước</button><span>Trang {page+1}/{Math.ceil(groupTotal/size)}</span><button className="evidence-button" disabled={loading||(page+1)*size>=groupTotal} onClick={()=>setPage(value=>value+1)}>Tiếp<ChevronRight size={16}/></button></div>}
    {selected&&<EvidenceViewer key={selected.key} event={selected.imageEvent} relatedEvents={selected.events} attemptId={attemptId} audience={audience} api={api} onClose={()=>setSelected(null)}/>}
  </section>;

}

export function EvidenceViewer({ event, relatedEvents=[event], attemptId, audience, api = evidenceApi, onClose }: { event: EvidenceEvent; relatedEvents?:EvidenceEvent[]; attemptId: number; audience: EvidenceAudience; api?: typeof evidenceApi; onClose: () => void }) {
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
  return <dialog ref={ref} className="evidence-viewer" onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }} aria-labelledby="evidence-viewer-title" onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}><header><div><h2 id="evidence-viewer-title">Ảnh bằng chứng · Lượt thi #{attemptId}</h2><p>{event.module==='OFFLINE'?'Hậu kiểm · Giờ chụp do thiết bị báo cáo: ':''}{date(event.occurredAt)} · {relatedEvents.filter(item=>item.event!=='OFFLINE_CAPTURE').length} cảnh báo · {reviewPriority(Math.max(...relatedEvents.map(item=>item.riskScore)))}</p><div className="evidence-warning-labels">{relatedEvents.filter(item=>item.event!=='OFFLINE_CAPTURE'||relatedEvents.length===1).map(item=><span key={item.id}>{eventNames[item.event]||item.event}<small>{item.module==='OFFLINE'?'Ảnh hậu kiểm':`${item.module} · ${Number(item.duration).toFixed(1)} giây`}</small></span>)}</div></div><button className="evidence-button" aria-label="Đóng ảnh bằng chứng" onClick={onClose}><X size={19} /></button></header><div className="evidence-viewer-body">{loading ? <div className="evidence-empty" role="status"><Loader2 className="animate-spin" />Đang tải ảnh...</div> : error ? <div className="evidence-empty evidence-error" role="alert"><AlertCircle size={25} /><p>{error}</p><button className="evidence-button" onClick={renew}><RefreshCw size={16} />Thử lại</button></div> : source && (mime.startsWith('video/') ? <video controls src={source} /> : mime.startsWith('audio/') ? <audio controls src={source} /> : <img key={version} src={source} onError={imageError} referrerPolicy="no-referrer" alt={`Bằng chứng cảnh báo ${eventNames[event.event] || event.event}, lượt thi ${attemptId}`} />)}</div><footer><span>{expiresAt ? expired ? 'Link xem đã hết hạn. Bạn có thể yêu cầu link mới.' : `Link xem có hiệu lực đến ${new Date(expiresAt).toLocaleTimeString('vi-VN')}.` : event.provider === 'local' ? 'Bằng chứng local cũ · Truy cập qua API được phân quyền.' : 'Link xem chỉ được cấp khi ảnh đã sẵn sàng.'}</span><button className="evidence-button" disabled={loading} onClick={renew}><RefreshCw size={15} />{expired ? 'Lấy link mới' : 'Tải lại ảnh'}</button></footer></dialog>;
}
