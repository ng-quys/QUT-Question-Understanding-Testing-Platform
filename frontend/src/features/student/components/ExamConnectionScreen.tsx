import { Clock3, Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import type { ExamConnectionPhase } from '../services/examConnection';
import './ExamConnectionScreen.css';

export function ExamConnectionScreen({ phase, remaining, expired, error, storageError, onRetry, onResume }:{
  phase: ExamConnectionPhase; remaining: string; expired: boolean;
  error?: string | null; storageError?: boolean; onRetry: () => void; onResume: () => void;
}) {
  const ready = phase === 'ready', busy = phase === 'resuming';
  const Icon = busy ? Loader2 : ready ? Wifi : WifiOff;
  return <section className="exam-connection-screen" aria-labelledby="exam-connection-heading">
    <div className={`exam-connection-icon ${ready ? 'ready' : ''}`}><Icon size={30} className={busy ? 'animate-spin' : undefined}/></div>
    <div className="exam-connection-content">
      <h2 id="exam-connection-heading">{expired ? 'Đã hết giờ làm bài' : busy ? 'Đang mở lại bài thi' : ready ? 'Đã kết nối lại' : 'Bài thi đang chờ kết nối'}</h2>
      <p role="status">{storageError ? 'Không lưu được bản dự phòng trên máy. Giữ trang này mở và báo giám thị.' : expired ? 'Hệ thống sẽ hoàn tất nộp bài khi kết nối được máy chủ.' : ready ? 'Bạn có thể tiếp tục lượt thi đang làm.' : 'Đáp án đã chọn được giữ lại. Bạn có thể vào thi tiếp khi có mạng.'}</p>
      <small>Thời gian thi vẫn tính theo lịch ca thi.</small>
      {error && <p className="exam-connection-error" role="alert">{error}</p>}
    </div>
    <div className="exam-connection-time"><Clock3 size={18}/><span>Còn lại</span><strong>{remaining}</strong></div>
    <div className="exam-connection-actions">
      {ready && !expired ? <button className="student-button primary" onClick={onResume}>Tiếp tục làm bài</button>
        : <button className="student-button secondary" disabled={busy} onClick={onRetry}><RefreshCw size={16}/>Kiểm tra kết nối</button>}
    </div>
  </section>;
}
