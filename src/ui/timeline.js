// [F18] left-scrolling timeline, clipped, notes at their intervals/heights
// [F19] cursor at absolute pitch position   [F20] red/green indicator
import { CONFIG } from '../config.js';

export class Timeline {
  constructor(canvas) { this.cv = canvas; this.g = canvas.getContext('2d'); this.curY = null; }

  y(m) {
    const { MIN_MIDI: lo, MAX_MIDI: hi } = CONFIG, H = this.cv.height;
    return H - (Math.max(lo - 1, Math.min(hi + 1, m)) - lo) / (hi - lo) * H;
  }

  draw({ song, t, frame, ghost }) {
    const g = this.g, W = this.cv.width, H = this.cv.height;
    const X = (tt) => CONFIG.HIT_LINE_X + (tt - t) * CONFIG.PX_PER_SEC;
    g.clearRect(0, 0, W, H);
    g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip();            // [F18] clipping

    song.notes.forEach((n) => {                                        // [F18] note at interval + height
      const x = X(n.start), w = (n.end - n.start) * CONFIG.PX_PER_SEC;
      if (x + w < 0 || x > W) return;
      g.fillStyle = t > n.end ? 'rgba(233,30,99,.35)' : '#e91e63';
      g.fillRect(x, this.y(n.midi) - 8, w, 16);
    });

    if (ghost) {                                                       // previous player's trail
      g.fillStyle = 'rgba(0,200,255,.6)';
      ghost.forEach(([tt, m]) => { const x = X(tt); if (x > 0 && x < W) g.fillRect(x, this.y(m) - 2, 3, 4); });
    }

    g.fillStyle = '#888'; g.fillRect(CONFIG.HIT_LINE_X, 0, 2, H);      // "now" line

    if (frame.disp != null) {                                          // [F19] voice cursor
      const ty = this.y(frame.disp);
      this.curY = this.curY == null ? ty : this.curY + (ty - this.curY) * 0.4;
      g.fillStyle = !frame.note ? '#999' : frame.hit ? '#4caf50' : '#e53935';   // [F20] green good / red bad
      g.strokeStyle = '#000'; g.lineWidth = 2;
      g.beginPath(); g.arc(CONFIG.HIT_LINE_X, this.curY, 11, 0, 7); g.fill(); g.stroke();
    } else this.curY = null;

    g.restore();
  }
}
