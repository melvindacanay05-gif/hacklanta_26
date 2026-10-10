// Pitch source: microphone, keyboard simulator, or auto-sing. read() returns MIDI (float) or null.
import { yin } from './pitch.js';
import { CONFIG } from '../config.js';

export class PitchInput {
  constructor() { this.analyser = null; this.buf = null; this.ctx = null; this.keyMidi = null; this.auto = false; }

  setKey(midi) { this.keyMidi = midi; }
  setAuto(on) { this.auto = on; }

  async enableMic(ctx) {
    this.ctx = ctx;
    if (this.analyser) return { ok: true, msg: '' };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false },
      });
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0;
      const mute = ctx.createGain(); mute.gain.value = 0;      // silent sink: no feedback
      ctx.createMediaStreamSource(stream).connect(this.analyser);
      this.analyser.connect(mute); mute.connect(ctx.destination);
      this.buf = new Float32Array(this.analyser.fftSize);
      return { ok: true, msg: '' };
    } catch (e) {
      return { ok: false, msg: `Mic blocked (${e.name}). Use keys or Auto-sing.` };
    }
  }

  read(t, note) {
    if (this.keyMidi != null) return this.keyMidi;                          // keyboard simulator
    if (this.auto) return note ? note.midi + Math.sin(t * 31.4) * 0.15 : null; // auto-sing with vibrato
    if (!this.analyser) return null;
    this.analyser.getFloatTimeDomainData(this.buf);                         // microphone
    const f = yin(this.buf, this.ctx.sampleRate);
    return f > 0 ? 69 + 12 * Math.log2(f / 440) : null;
  }
}
