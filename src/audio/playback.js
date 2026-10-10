// [F2] play song audio on the laptop   [F3] instrumental.wav from the song folder
// [F9] vocals-free: expects instrumental.wav to already have vocals removed.
// Falls back to a synthesized bass line if the wav is missing.
import { midiToHz } from './pitch.js';

export class Playback {
  constructor(ctx) { this.ctx = ctx; this.nodes = []; this.t0 = null; this.buffer = null; }

  /** Load instrumental.wav. Returns true if found. */
  async prepare(song) {
    this.buffer = null;
    try {
      const res = await fetch(song.base + song.instrumental);
      if (res.ok) this.buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch { /* fall back to synth */ }
    return !!this.buffer;
  }

  start(song, { guide }) {
    this.stop();
    const c = this.ctx;
    this.t0 = c.currentTime + 0.05;                    // [F4] timeline zero = this moment
    const t0 = this.t0;
    [0, 0.75, 1.5, 2.25].forEach((o, i) => this.tone('triangle', i === 3 ? 880 : 587, t0 + o, 0.12, 0.3));
    if (this.buffer) {
      const s = c.createBufferSource(); s.buffer = this.buffer; s.connect(c.destination); s.start(t0);
      this.nodes.push(s);
    } else {
      song.chords.forEach((ch) => this.tone('triangle', midiToHz(ch.root), t0 + ch.time, ch.duration, 0.2));
    }
    if (guide) song.notes.forEach((n) => this.tone('sine', midiToHz(n.midi), t0 + n.start, n.end - n.start, 0.15));
  }

  tone(type, freq, start, dur, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(c.destination); o.start(start); o.stop(start + dur + 0.05);
    this.nodes.push(o);
  }

  /** Song time in seconds, driven by the audio clock. */
  time() { return this.t0 == null ? 0 : Math.max(0, this.ctx.currentTime - this.t0); }

  stop() {
    this.nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } });
    this.nodes = []; this.t0 = null;
  }
}
