/** One context and one timeline per mounted staff workspace. No autoplay workarounds. */
export type SoundName = "new_booking" | "scan_success" | "scan_error";
export type SoundStatus = "muted" | "locked" | "ready" | "unavailable";
const tones: Record<SoundName, readonly (readonly [number, number, number])[]> = {
  new_booking: [[660, 0, .16], [880, .2, .18], [1100, .42, .22]],
  scan_success: [[740, 0, .09], [1110, .1, .14]],
  scan_error: [[330, 0, .12], [250, .14, .14]],
};
export class SoundController {
  private context?: AudioContext;
  private wanted = true;
  private unavailable = false;
  private closed = false;
  private until = 0;
  private nodes = new Set<OscillatorNode>();
  private events = new Set<string>();
  private revision = 0;
  private previews = 0;
  constructor(
    private create: () => AudioContext,
    private storage: Pick<Storage, "getItem" | "setItem">,
    private key: string,
    private changed: (status: SoundStatus) => void,
    private alwaysOn = false,
  ) {
    if (!alwaysOn) {
      try { this.wanted = storage.getItem(key) !== "off"; } catch { /* Private mode can deny storage. */ }
    }
  }
  get status(): SoundStatus {
    return !this.wanted ? "muted" : this.unavailable ? "unavailable" : this.context?.state === "running" ? "ready" : "locked";
  }
  private publish() { if (!this.closed) this.changed(this.status); }
  async enable() {
    if (this.closed) return;
    const revision = ++this.revision;
    this.wanted = true;
    if (!this.alwaysOn) { try { this.storage.setItem(this.key, "on"); } catch {} }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!this.context || this.context.state === "closed") {
        this.context = this.create();
        this.context.onstatechange = () => {
          if (this.context?.state !== "running") this.stop();
          this.publish();
        };
      }
      this.unavailable = false;
      // Call resume synchronously: mount may be allowed, otherwise a real gesture retries.
      const resumed = this.context.resume();
      await Promise.race([resumed, new Promise<void>(resolve => { timer = setTimeout(resolve, 1500); })]);
    } catch { this.unavailable = !this.context; }
    finally { clearTimeout(timer); if (revision === this.revision) this.publish(); }
  }
  unlock() {
    // Normal mode respects mute; the Protocol workspace opts into always-on mode.
    if (!this.wanted || this.closed) return Promise.resolve();
    if (this.status === "ready") return Promise.resolve();
    return this.enable();
  }
  async test() {
    await this.enable();
    if (this.status === "ready") this.play("scan_success", "sound-test:" + ++this.previews);
  }
  mute() {
    if (this.alwaysOn) return;
    ++this.revision;
    this.wanted = false;
    try { this.storage.setItem(this.key, "off"); } catch {}
    this.stop();
    this.publish();
  }
  private stop() {
    for (const node of this.nodes) { try { node.stop(); } catch {} }
    this.nodes.clear();
    this.until = 0;
  }
  play(name: SoundName, eventId: string) {
    if (this.closed || this.events.has(eventId)) return false;
    this.events.add(eventId);
    const ctx = this.context;
    if (this.status !== "ready" || !ctx) { this.publish(); return false; }
    // A bounded timeline serializes bursts; muted/blocked events are never replayed later.
    if (this.until - ctx.currentTime > 2) {
      if (name === "new_booking") return false;
      // Scan feedback takes priority over a saturated booking chime backlog.
      this.stop();
    }
    const start = Math.max(ctx.currentTime, this.until);
    try {
      for (const [frequency, offset, duration] of tones[name]) {
        const oscillator = ctx.createOscillator(), gain = ctx.createGain();
        oscillator.type = "triangle";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start + offset);
        gain.gain.linearRampToValueAtTime(.16, start + offset + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, start + offset + duration);
        oscillator.connect(gain); gain.connect(ctx.destination);
        this.nodes.add(oscillator);
        oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start + offset); oscillator.stop(start + offset + duration + .01);
      }
      const last = tones[name][tones[name].length - 1];
      this.until = start + last[1] + last[2] + .06;
      return true;
    } catch { this.stop(); this.unavailable = true; this.publish(); return false; }
  }
  dispose() {
    this.closed = true; ++this.revision; this.stop(); this.events.clear();
    if (this.context) { this.context.onstatechange = null; void this.context.close().catch(() => {}); }
  }
}
