export interface CameraLease { stream: MediaStream; release: (handoff?: boolean) => void }
type Entry = { stream: MediaStream; users: number; holdUntil: number; timer?: ReturnType<typeof setTimeout> };

/** Share the verified video stream across the preflight/monitor transition, without reopening the camera. */
export class ExamCameraPool {
  private current?: Entry;
  private opening?: Promise<Entry>;
  private open: () => Promise<MediaStream>;
  private clock: () => number;
  constructor(open: () => Promise<MediaStream>, clock = Date.now) { this.open = open; this.clock = clock; }
  private close(entry: Entry) {
    clearTimeout(entry.timer);
    entry.stream.getTracks().forEach(track => track.stop());
    if (this.current === entry) this.current = undefined;
  }
  private idle(entry: Entry) {
    if (entry.users) return;
    const remaining = entry.holdUntil - this.clock();
    if (remaining > 0) entry.timer = setTimeout(() => this.idle(entry), remaining);
    else this.close(entry);
  }
  discardIdle() { if (this.current && !this.current.users) this.close(this.current); }
  async acquire(): Promise<CameraLease> {
    let entry = this.current;
    if (!entry || !entry.stream.getVideoTracks().some(track => track.readyState === 'live' && track.enabled && !track.muted)) {
      this.opening ??= this.open().then(stream => this.current = {stream, users: 0, holdUntil: 0}).finally(() => {this.opening = undefined;});
      entry = await this.opening;
    }
    clearTimeout(entry.timer);entry.holdUntil = 0;entry.users++;
    const held = entry;
    let released = false;
    return {stream: held.stream, release: (handoff = false) => {
      if (released) return;released = true;
      if (handoff) held.holdUntil = this.clock() + 30000;
      held.users--;this.idle(held);
    }};
  }
}

export const examCamera = new ExamCameraPool(async () => {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Cần HTTPS hoặc localhost để truy cập camera.');
  return navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:10,max:15}},audio:false});
});
