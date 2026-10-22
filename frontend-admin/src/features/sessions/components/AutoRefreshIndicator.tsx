import './AutoRefreshIndicator.css';
import { ADMIN_REFRESH_INTERVAL_MS } from '../services/visiblePolling';

export function AutoRefreshIndicator({ interval = ADMIN_REFRESH_INTERVAL_MS }: { interval?: number }) {
  return <span className="auto-refresh-indicator"><i aria-hidden="true"/>Tự cập nhật mỗi {interval/1000} giây</span>;
}
