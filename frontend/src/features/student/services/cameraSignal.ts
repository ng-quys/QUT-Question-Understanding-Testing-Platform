/** A short media interruption does not immediately hide an exam. Server proof is still required to unlock it. */
export class CameraSignal {
  private missingSince: number | null = null;
  observe(available: boolean, now: number): boolean {
    if (available) this.missingSince = null;
    else this.missingSince ??= now;
    return this.missingSince !== null && now - this.missingSince >= 5000;
  }
}
