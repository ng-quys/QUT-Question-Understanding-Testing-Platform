export type ExamConnectionPhase = 'active' | 'offline' | 'ready' | 'resuming';
type ConnectionOptions = {
  online: () => boolean;
  probe: () => Promise<void>;
  onChange: (phase: ExamConnectionPhase) => void;
  onDisconnect: () => void;
};

/** A browser online event is a hint; only a server response permits resuming. */
export class ExamConnection {
  phase: ExamConnectionPhase = 'active';
  private generation = 0;
  private stopped = false;
  private checking: Promise<boolean> | undefined;
  private options: ConnectionOptions;
  constructor(options: ConnectionOptions) { this.options = options; }
  private set(phase: ExamConnectionPhase) {
    if (this.stopped || this.phase === phase) return;
    this.phase = phase;
    this.options.onChange(phase);
  }
  disconnect() {
    if (this.stopped) return;
    this.generation++;
    this.set('offline');
    this.options.onDisconnect();
  }
  check(): Promise<boolean> {
    if (this.stopped || this.phase === 'resuming') return Promise.resolve(false);
    if (!this.options.online()) { this.disconnect(); return Promise.resolve(false); }
    if (this.checking) return this.checking;
    const generation = this.generation;
    const work = async () => {
      try {
        await this.options.probe();
        if (this.stopped || generation !== this.generation) return false;
        if (!this.options.online()) { this.disconnect(); return false; }
        if (this.phase !== 'active') this.set('ready');
        return true;
      } catch {
        if (!this.stopped && generation === this.generation) this.disconnect();
        return false;
      } finally { this.checking = undefined; }
    };
    this.checking = Promise.resolve().then(work);
    return this.checking;
  }
  async resume(verifyAttempt: () => Promise<void>): Promise<boolean> {
    if (this.stopped || this.phase !== 'ready' || !this.options.online()) return false;
    const generation = ++this.generation;
    this.set('resuming');
    try {
      await verifyAttempt();
      if (this.stopped || generation !== this.generation) return false;
      if (!this.options.online()) { this.disconnect(); return false; }
      this.set('active');
      return true;
    } catch (error) {
      if (!this.stopped && generation === this.generation) this.disconnect();
      throw error;
    }
  }
  stop() { this.stopped = true; this.generation++; }
}
