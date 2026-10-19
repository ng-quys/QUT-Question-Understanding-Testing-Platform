import { QrCode } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ExamSearchResult } from '../services/studentService';
import { StudentDialog } from './StudentWorkspace';

const fmt = (value?: string | null) => {

  if(!value) return '—';

  return new Date(value).toLocaleString('vi-VN', {

    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',

  });

};

export const JoinExamView = ({
  now,
  code,
  setCode,
  joining,
  message,
  scannerOpen,
  setScannerOpen,
  scannerError,
  setScannerError,
  searchResult,
  onSearch,
  onEnter,
}: {
  now: number;
  code: string;
  setCode: (v: string) => void;
  joining: boolean;
  message: string | null;
  scannerOpen: boolean;
  setScannerOpen: (v: boolean) => void;
  scannerError: string | null;
  setScannerError: (v: string | null) => void;
  searchResult: ExamSearchResult | null;
  onSearch: () => void;
  onEnter: () => void;
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if(!scannerOpen) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    let timer = 0;

    const start = async () => {
      try {
        const Detector = (window as unknown as { BarcodeDetector?: new (o?: { formats?: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
        if(!Detector) {
          setScannerError('Trình duyệt này chưa hỗ trợ quét QR trực tiếp. Bạn có thể dán đường link QR hoặc nhập mã.');
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if(cancelled || !videoRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new Detector({ formats: ['qr_code'] });
        const scan = async () => {
          if(cancelled || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            const value = results[0]?.rawValue;
            if(value) {
              setCode(value);
              setScannerOpen(false);
              return;
            }
          } catch {
            // A QR code may be unreadable in this frame; retry on the next scan.
          }
          timer = window.setTimeout(() => void scan(), 500);
        };
        void scan();
      } catch(e) {
        setScannerError(e instanceof Error ? e.message : 'Không thể mở camera quét QR');
      }
    };
    void start();
    return () => {
      cancelled = true;
      if(timer) window.clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [scannerOpen, setCode, setScannerError, setScannerOpen]);

  return (
    <div className="student-join-view space-y-5">

      <div>

        <div className="student-eyebrow">
          KẾT NỐI VỚI KỲ THI CỦA BẠN
        </div>
        <h1 className="text-2xl font-extrabold mt-2">
          Tham gia thi
        </h1>

        <p className="text-sm text-slate-500 mt-1">
          Nhập mã do giảng viên cung cấp, dán đường link hoặc quét QR.
        </p>

      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">

        <label htmlFor="student-join-code" className="text-sm font-bold">
          Mã ca thi hoặc đường link
        </label>

        <div className="flex gap-2">

          <input id="student-join-code" autoComplete="off" disabled={joining} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if(e.key === 'Enter' && !joining) onSearch(); }} placeholder="VD: EXAM-439CC267" className="student-code-input" />

          <button onClick={onSearch} disabled={joining || !code.trim()} className="student-button primary">
            {joining ? 'Đang tìm...' : 'Tìm kiếm'}
          </button>

        </div>

        <button onClick={() => { setScannerError(null); setScannerOpen(true); }} className="student-button secondary student-full-width">
          <QrCode className="w-5 h-5" />{" Quét QR bằng camera"}</button>

        {message && <div className={`p-3 rounded-xl text-sm font-semibold ${searchResult ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {message}
        </div>}

        {scannerError && <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm">
          {scannerError}
        </div>}

      </div>

      {searchResult && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">

          <div className="flex items-start justify-between gap-4">

            <div>

              <div className="text-xs font-bold text-slate-500">
                {searchResult.courseCode}{" · "}{searchResult.examCode}
              </div>

              <h2 className="text-xl font-extrabold mt-1">
                {searchResult.examTitle}
              </h2>

              <p className="text-sm text-slate-500 mt-1">
                {searchResult.sessionName || 'Ca thi'}
              </p>

            </div>

            <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${searchResult.canEnter ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {searchResult.canEnter ? (searchResult.alreadyAttempted ? 'Đang làm dở' : 'Đang mở') : (new Date(searchResult.startTime).getTime() > now ? 'Chưa mở' : 'Đã đóng')}
            </span>

          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-sm">

            <InfoRow label="Phòng thi" value={searchResult.roomCode} />

            <InfoRow label="Số câu" value={String(searchResult.totalQuestions)} />

            <InfoRow label="Thời lượng" value={`${searchResult.durationMinutes} phút`} />

            <InfoRow label="Tổng điểm" value={String(searchResult.totalPoints)} />

            <InfoRow label="Bắt đầu" value={fmt(searchResult.startTime)} />

            <InfoRow label="Kết thúc" value={fmt(searchResult.endTime)} />

          </div>

          <div className="flex justify-end">

            <button onClick={onEnter} disabled={joining || !searchResult.canEnter || searchResult.alreadyAttempted && searchResult.attemptStatus !== 'in_progress'} className="student-button primary">

              {joining ? 'Đang chuẩn bị...' : searchResult.attemptStatus === 'in_progress' ? 'Tiếp tục bài thi' : 'Bắt đầu bài thi'}

            </button>

          </div>

        </div>
      )}

      <div className="student-join-tips">
        <strong>
          Trước khi bắt đầu
        </strong>{" Chuẩn bị ảnh tham chiếu trong hồ sơ, kiểm tra kết nối mạng và đọc kỹ thời gian ca thi. Nếu ca thi bật giám sát, hãy chuẩn bị camera và micro."}</div>

      {scannerOpen && (
        <StudentDialog title="Quét mã QR ca thi" description="Đưa mã QR của ca thi vào giữa khung hình." onClose={() => setScannerOpen(false)}>

          <video ref={videoRef} className="w-full rounded-xl bg-black aspect-square object-cover" muted playsInline />

          {scannerError && <div className="student-notice error mt-3" role="alert">
            {scannerError}
          </div>}

          <div className="student-dialog-actions">
            <button className="student-button secondary" onClick={() => setScannerOpen(false)}>
              Đóng camera
            </button>
          </div>

        </StudentDialog>
      )}

    </div>
  );
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-1 border-b border-slate-100 pb-3">
    <span className="text-xs text-slate-500">
      {label}
    </span>
    <span className="font-bold break-words">
      {value}
    </span>
  </div>
);
