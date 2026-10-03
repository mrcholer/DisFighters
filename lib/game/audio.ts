export type Sound = "select" | "start" | "hit" | "block" | "shield-break" | "jump" | "round-end";

/** Small, original synthesized cues. Audio only starts after a player gesture. */
export class GameAudio {
  private context: AudioContext | null = null;
  muted = false;
  unlock() {
    if (this.muted) return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
    } catch { /* Audio is optional when the host blocks Web Audio. */ }
  }
  play(sound: Sound) {
    if (this.muted || !this.context || this.context.state !== "running") return;
    const context = this.context;
    const now = context.currentTime;
    const presets: Record<Sound, [number, number, number, OscillatorType]> = {
      select: [460, 700, 0.065, "sine"], start: [160, 620, 0.3, "triangle"],
      hit: [125, 38, 0.12, "sawtooth"], block: [790, 210, 0.08, "triangle"],
      "shield-break": [980, 55, 0.35, "sawtooth"],
      jump: [140, 360, 0.09, "sine"], "round-end": [440, 660, 0.4, "triangle"],
    };
    const [from, to, duration, wave] = presets[sound];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(sound === "hit" ? 0.1 : 0.035, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(now); oscillator.stop(now + duration + 0.015);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  dispose() { if (this.context) void this.context.close().catch(() => {}); this.context = null; }
}
