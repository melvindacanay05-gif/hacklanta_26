// YIN pitch detection + note helpers
import { CONFIG } from '../config.js';

const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export const noteName = (m) => NAMES[((Math.round(m) % 12) + 12) % 12];
export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Returns frequency in Hz, or -1 if silent/unvoiced. */
export function yin(buf, sr) {
  let r = 0; for (const x of buf) r += x * x;
  if (Math.sqrt(r / buf.length) < CONFIG.RMS_GATE) return -1;
  const n = buf.length >> 1, d = new Float32Array(n);
  const maxT = Math.min(n - 1, (sr / 80) | 0), minT = (sr / 1000) | 0;
  for (let t = 1; t <= maxT; t++) {                 // difference function (stepped sampling)
    let s = 0;
    for (let i = 0; i < n; i += 2) { const v = buf[i] - buf[i + t]; s += v * v; }
    d[t] = s;
  }
  let run = 0; d[0] = 1;                            // cumulative mean normalized difference
  for (let t = 1; t <= maxT; t++) { run += d[t]; d[t] = d[t] * t / run; }
  for (let t = Math.max(2, minT); t < maxT; t++) {
    if (d[t] < 0.15) {
      while (t + 1 < maxT && d[t + 1] < d[t]) t++;
      const a = d[t - 1], b = d[t], c = d[t + 1], den = a - 2 * b + c;   // parabolic interpolation
      return sr / (t + (den ? (a - c) / (2 * den) : 0));
    }
  }
  return -1;
}
