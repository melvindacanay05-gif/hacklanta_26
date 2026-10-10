// Shared constants. Tweak gameplay feel here.
export const CONFIG = {
  PX_PER_SEC: 140,    // [F18] timeline scroll speed
  HIT_LINE_X: 150,    // [F18] x position of "now"
  MIN_MIDI: 55,       // [F18] bottom of timeline (G3)
  MAX_MIDI: 74,       // [F18] top of timeline (D5)
  PERFECT: 0.35,      // semitones
  GOOD: 0.75,         // semitones; also the green/red cutoff [F20]
  RMS_GATE: 0.005,    // mic silence threshold
  REF_MIDI: 65,       // where the cursor sits during rests
  KEYMAP: { a:60, w:61, s:62, e:63, d:64, f:65, t:66, g:67, y:68, h:69, u:70, j:71, k:72 },
};
