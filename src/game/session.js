// One player's run. [F4] timeline starts at 0   [F8] ends at song.duration
import { findNoteIndex, scoreFrame } from './scoring.js';

export class Session {
  constructor(opts) { Object.assign(this, opts); this.running = false; } // song, playback, input, stats, onFrame, onEnd

  start() { this.running = true; requestAnimationFrame(() => this.tick()); }

  stop() { this.running = false; this.playback.stop(); }

  tick() {
    if (!this.running) return;
    const t = this.playback.time();
    const idx = findNoteIndex(this.song.notes, t);                    // [F6]
    const note = idx >= 0 ? this.song.notes[idx] : null;
    const raw = this.input.read(t, note);
    const res = scoreFrame(this.stats, idx, note, raw, t);            // [F12]
    this.onFrame({ t, note, raw, ...res });
    if (t >= this.song.duration) {                                    // [F8]
      this.running = false; this.playback.stop(); this.onEnd(); return;
    }
    requestAnimationFrame(() => this.tick());
  }
}
