export const ADMIN_REFRESH_INTERVAL_MS = 10000;

type PollingEnvironment = {
  isVisible: () => boolean;
  subscribe: (listener: () => void) => () => void;
  schedule: (callback: () => void, delay: number) => () => void;
};

const browserEnvironment: PollingEnvironment = {
  isVisible: () => document.visibilityState !== 'hidden',
  subscribe(listener) {
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
  schedule(callback, delay) {
    const timer = window.setTimeout(callback, delay);
    return () => window.clearTimeout(timer);
  },
};

/** Refresh only while visible; wait for each request before scheduling another. */
export function startVisiblePolling(
  refresh: (signal: AbortSignal) => Promise<void>,
  { interval = 15000, immediate = true, environment = browserEnvironment } = {},
): () => void {
  let stopped = false;
  let active: AbortController | undefined;
  let cancelTimer: (() => void) | undefined;
  let pending = false;

  async function poll() {
    cancelTimer?.();
    cancelTimer = undefined;
    if (stopped || !environment.isVisible()) return;
    if (active) { pending = true; return; }
    const controller = new AbortController();
    active = controller;
    try { await refresh(controller.signal); }
    catch { /* A failed refresh must not stop subsequent attempts. */ }
    finally {
      active = undefined;
      if (!stopped && environment.isVisible()) {
        if (pending) { pending = false; void poll(); }
        else cancelTimer = environment.schedule(() => void poll(), interval);
      }
    }
  }

  const unsubscribe = environment.subscribe(() => {
    cancelTimer?.();
    cancelTimer = undefined;
    if (!environment.isVisible()) { pending = false; active?.abort(); }
    else void poll();
  });
  if (environment.isVisible()) {
    if (immediate) void poll();
    else cancelTimer = environment.schedule(() => void poll(), interval);
  }
  return () => {
    stopped = true;
    unsubscribe();
    cancelTimer?.();
    active?.abort();
  };
}
