import { useEffect } from 'react';
import { ADMIN_ORIGIN } from '@shared/app/frontendOrigins';
import { clearLegacyAdminSession } from './legacyAdminSession';

/** Existing bookmarks move to the standalone admin app without transferring credentials. */
export function LegacyAdminRedirect({ login = false }: { login?: boolean }) {
  useEffect(() => {
    if (ADMIN_ORIGIN && ADMIN_ORIGIN !== window.location.origin) {
      clearLegacyAdminSession();
      window.location.replace(ADMIN_ORIGIN + (login ? '/login' : '/'));
    }
  }, [login]);
  return <main className="p-8 text-center text-slate-600" role="status">{ADMIN_ORIGIN ? 'Đang mở cổng quản trị…' : 'Cổng quản trị hiện chưa sẵn sàng. Vui lòng liên hệ đơn vị quản lý.'}</main>;
}
