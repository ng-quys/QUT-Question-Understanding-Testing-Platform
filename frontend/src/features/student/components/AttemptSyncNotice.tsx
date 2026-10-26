import { HardDrive } from 'lucide-react';
import type { RecoveryState } from '../services/attemptRecovery';

export function AttemptSyncNotice({state}:{state:RecoveryState;online:boolean;expired:boolean;onRetry:()=>void}){
  if(!state.storageError)return null;
  return <div className="student-sync-notice waiting" role="alert"><HardDrive size={21}/><div><strong>Không lưu được bài trên máy</strong><p>Giữ trang thi mở và báo giám thị để được hỗ trợ.</p></div></div>;
}
