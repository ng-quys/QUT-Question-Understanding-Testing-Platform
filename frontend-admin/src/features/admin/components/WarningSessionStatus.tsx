import { examDate } from '@shared/utils/examTime';

export function warningSessionStage(status: string, startTime: string, endTime: string, now = Date.now()) {
  if (status === 'cancelled' || status === 'completed') return status;
  const start = examDate(startTime).getTime(), end = examDate(endTime).getTime();
  if (Number.isFinite(end) && now >= end) return 'completed';
  if (Number.isFinite(start) && now >= start) return 'ongoing';
  if (Number.isFinite(start)) return 'scheduled';
  return status;
}

export function WarningSessionStatus({ status, startTime, endTime }: { status: string; startTime: string; endTime: string }) {
  const stage = warningSessionStage(status, startTime, endTime);
  const label = { ongoing: 'Đang thi', completed: 'Đã kết thúc', cancelled: 'Đã hủy', scheduled: 'Sắp diễn ra' }[stage];
  const tone = stage === 'ongoing' ? 'green' : stage === 'cancelled' ? 'red' : 'neutral';
  return <span className={`admin-badge ${tone}`}><i />{label || 'Chưa xác định'}</span>;
}
