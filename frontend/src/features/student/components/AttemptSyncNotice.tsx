import { CheckCircle2, HardDrive, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import type { RecoveryState } from '../services/attemptRecovery';

export function AttemptSyncNotice({state,online,expired,onRetry}:{state:RecoveryState;online:boolean;expired:boolean;onRetry:()=>void}){
  const pending=state.pending.length;
  if(online&&!expired&&!state.storageError&&!state.localSaving&&!state.syncing&&pending===0)return null;
  const warning=state.storageError||!online||pending>0||expired;
  const Icon=state.storageError?HardDrive:!online?WifiOff:state.syncing||state.localSaving?Loader2:pending?HardDrive:CheckCircle2;
  const title=expired?'Đã hết giờ làm bài':state.storageError?'Không bảo đảm lưu tạm trên máy':!online?'Đang mất kết nối mạng':state.localSaving?'Đang lưu đáp án trên máy':state.syncing?'Đang đồng bộ bài làm':pending?'Đang chờ đồng bộ':'Bài làm đã đồng bộ';
  const description=state.storageError?'Bộ nhớ trình duyệt không truy cập được. Hệ thống vẫn thử gửi đáp án lên máy chủ; giữ trang này mở và báo giám thị nếu mất kết nối.':expired
    ?`Không thể chọn thêm đáp án. ${pending?`${pending} câu chưa được xác nhận đồng bộ; kết quả chỉ tính dữ liệu máy chủ đã nhận. `:''}Hệ thống sẽ gửi yêu cầu nộp bài khi kết nối được máy chủ.`
    :pending?`${pending} câu chưa được máy chủ xác nhận. ${state.localSaving?'Đang lưu tạm…':'Đáp án được giữ trên trình duyệt này và tự gửi lại khi kết nối được máy chủ.'}`
    :!online?'Các đáp án trước đó đã được máy chủ xác nhận. Bạn có thể làm tiếp; đáp án mới sẽ được lưu tạm trên máy này.'
    :'Các đáp án đã chọn đã được máy chủ xác nhận. Giờ kết thúc ca thi không thay đổi khi mất mạng.';
  return <div className={`student-sync-notice ${warning?'waiting':'saved'}`} role="status" aria-live="polite"><Icon size={21} className={state.syncing||state.localSaving?'animate-spin':''}/><div><strong>{title}</strong><p>{description}</p></div>{pending>0&&online&&!expired&&!state.syncing&&<button type="button" className="student-button secondary" onClick={onRetry}><RefreshCw size={15}/>Đồng bộ lại</button>}</div>;
}
