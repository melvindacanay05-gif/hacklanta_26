// [F6] find the note from its interval   [F7] per-note scores   [F12] per-player stats
import { CONFIG } from '../config.js';

/** [F6] Note index whose [start, end] interval contains t, or -1. */
export function findNoteIndex(notes, t) {
  return notes.findIndex((n) => t >= n.start && t <= n.end);
}

/** Octave-folded distance in semitones (0 to 6). */
export function foldDist(a, b) {
  const d = Math.abs(((a - b) % 12 + 12) % 12);
  return Math.min(d, 12 - d);
}

export function newStats(notes) {
  return {
    score: 0, combo: 0, maxCombo: 0, frames: 0, hitFrames: 0, perfect: 0, good: 0, miss: 0,
    notes: notes.map(() => ({ frames: 0, hits: 0, points: 0 })),  // [F7] one slot per note index
    hist: [],                                                       // [t, displayMidi] for ghost trail
  };
}

/** Score one frame. Returns what the UI needs to draw. */
export function scoreFrame(stats, idx, note, midi, t) {
  let disp = null, dist = Infinity;
  if (midi != null) {
    // show the cursor in the octave nearest the target so any register works
    disp = midi + 12 * Math.round(((note ? note.midi : CONFIG.REF_MIDI) - midi) / 12);
    if (note) dist = foldDist(midi, note.midi);
  }
  if (note) {
    const ns = stats.notes[idx];
    stats.frames++; ns.frames++;
    if (dist <= CONFIG.GOOD) {
      stats.hitFrames++; ns.hits++;
      stats.combo++; stats.maxCombo = Math.max(stats.maxCombo, stats.combo);
      const mult = stats.combo >= 30 ? 3 : stats.combo >= 15 ? 2 : stats.combo >= 5 ? 1.5 : 1;
      const perfect = dist <= CONFIG.PERFECT;
      const pts = Math.round((perfect ? 100 : 50) * mult);
      stats.score += pts; ns.points += pts;
      perfect ? stats.perfect++ : stats.good++;
    } else { stats.combo = 0; stats.miss++; }
  }
  if (disp != null) stats.hist.push([t, disp]);
  return { disp, dist, hit: dist <= CONFIG.GOOD };
}

/** [F7] note index -> recorded score, for the terminal table. */
export function noteReport(song, stats) {
  return song.notes.map((n, i) => ({
    noteIndex: i, lyric: n.lyric, targetMidi: n.midi,
    accuracyPct: stats.notes[i].frames ? Math.round(100 * stats.notes[i].hits / stats.notes[i].frames) : 0,
    points: stats.notes[i].points,
  }));
}
