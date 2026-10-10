// [F10] 2+ players   [F11] device names   [F12] individual scores   [F13][F14] end-of-game output
import { newStats, noteReport } from './scoring.js';

export class Roster {
  constructor() { this.list = []; this.add(); this.add(); }

  add() { this.list.push({ name: `Device ${this.list.length + 1}`, stats: null }); }
  remove(i) { if (this.list.length > 1) this.list.splice(i, 1); }
  rename(i, name) { this.list[i].name = name.trim() || `Device ${i + 1}`; }
  reset(notes) { this.list.forEach((p) => { p.stats = newStats(notes); }); }

  totals() {
    return this.list.map((p) => ({
      name: p.name, score: p.stats.score, maxCombo: p.stats.maxCombo,
      accuracy: p.stats.frames ? Math.round(100 * p.stats.hitFrames / p.stats.frames) : 0,
    }));
  }
}

/** [F7][F13][F14] Terminal output (browser devtools console, F12): total next to device name + per-note table. */
export function logResults(roster, song) {
  console.group('PitchBattle results');
  roster.list.forEach((p) => {
    console.log(`${p.name}: ${p.stats.score}`);
    console.table(noteReport(song, p.stats));
  });
  console.groupEnd();
}
