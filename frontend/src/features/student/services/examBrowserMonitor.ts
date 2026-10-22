type BrowserEvent = 'FULLSCREEN_EXIT' | 'TAB_HIDDEN' | 'WINDOW_BLUR';
type MonitorDocument = Pick<Document, 'addEventListener' | 'removeEventListener' | 'hidden' | 'fullscreenElement'>;
type MonitorWindow = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export function monitorExamBrowser({ doc = document, win = window, onViolation, onRestore, onFullscreen }: {
  doc?: MonitorDocument; win?: MonitorWindow;
  onViolation: (type: BrowserEvent) => void;
  onRestore: (type: BrowserEvent) => void;
  onFullscreen: (active: boolean) => void;
}) {
  let wasFullscreen = Boolean(doc.fullscreenElement);
  const fullscreen = () => {
    const active = Boolean(doc.fullscreenElement);
    onFullscreen(active);
    if (wasFullscreen && !active) onViolation('FULLSCREEN_EXIT');
    else if (active) onRestore('FULLSCREEN_EXIT');
    wasFullscreen = active;
  };
  const visibility = () => {
    if (doc.hidden) onViolation('TAB_HIDDEN');
    else onRestore('TAB_HIDDEN');
  };
  const blur = () => { if (!doc.hidden) onViolation('WINDOW_BLUR'); };
  const focus = () => onRestore('WINDOW_BLUR');
  doc.addEventListener('fullscreenchange', fullscreen);
  doc.addEventListener('visibilitychange', visibility);
  win.addEventListener('blur', blur);
  win.addEventListener('focus', focus);
  return () => {
    doc.removeEventListener('fullscreenchange', fullscreen);
    doc.removeEventListener('visibilitychange', visibility);
    win.removeEventListener('blur', blur);
    win.removeEventListener('focus', focus);
  };
}
