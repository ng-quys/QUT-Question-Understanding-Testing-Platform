import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAuthSession, getToken } from '../features/auth/services/authService';
import { sessionHome } from './sessionHome';
import { workspaceHistoryAction, type WorkspaceHistoryMarker } from './workspaceHistory';

/** Keep one app-owned history entry below the admin/student workspace. */
export function WorkspaceHistoryBoundary() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialized = useRef<string | null>(null);
  const auth = getAuthSession();
  const home = sessionHome(auth, getToken());
  const identity = auth && home && (auth.role === 'admin' || auth.role === 'student')
    ? `${auth.role}:${auth.userId ?? auth.username}` : null;

  useLayoutEffect(() => {
    if (!identity || !home) { initialized.current = null; return; }
    if (location.pathname !== home) return;
    const state = location.state as { __examflowHistory?: WorkspaceHistoryMarker } | null;
    const action = workspaceHistoryAction(identity, initialized.current, state?.__examflowHistory);
    if (action === 'seed') {
      navigate(location.pathname + location.search + location.hash, {
        replace: true, state: { ...state, __examflowHistory: { identity, kind: 'floor' } },
      });
    } else if (action === 'push') {
      const firstVisit = initialized.current !== identity;
      initialized.current = identity;
      navigate(firstVisit ? location.pathname + location.search + location.hash : home, {
        state: { ...state, __examflowHistory: { identity, kind: 'workspace' } },
      });
    } else initialized.current = identity;
  }, [home, identity, location, navigate]);
  return null;
}
