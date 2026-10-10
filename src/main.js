// Wiring only: connects UI events to the audio / game modules.
import { CONFIG } from './config.js';
import { loadIndex, loadSong } from './songs.js';
import { PitchInput } from './audio/input.js';
import { noteName } from './audio/pitch.js';
import { Playback } from './audio/playback.js';
import { Session } from './game/session.js';
import { Roster, logResults } from './game/roster.js';
import { Timeline } from './ui/timeline.js';
import * as UI from './ui/screens.js';

const $ = UI.$;
const app = { index: null, song: null, roster: new Roster(), ctx: null, playback: null,
              input: new PitchInput(), session: null, turn: 0, micMsg: '', hasWav: false };
const timeline = new Timeline($('timeline'));

// ---- keyboard pitch simulator
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.repeat) return;
  const m = CONFIG.KEYMAP[e.key.toLowerCase()]; if (m) app.input.setKey(m);
});
addEventListener('keyup', (e) => { if (CONFIG.KEYMAP[e.key.toLowerCase()]) app.input.setKey(null); });

// ---- setup screen
function redrawPlayers() {
  UI.renderPlayerList(app.roster, {
    onRename: (i, n) => app.roster.rename(i, n),
    onRemove: (i) => { app.roster.remove(i); redrawPlayers(); },
  });
}
$('btn-add').onclick = () => { app.roster.add(); redrawPlayers(); };

// ---- play / turns
$('btn-play').onclick = async () => {                                  // [F1] play
  app.ctx = app.ctx || new AudioContext();
  await app.ctx.resume();
  app.playback = app.playback || new Playback(app.ctx);
  app.micMsg = (await app.input.enableMic(app.ctx)).msg;
  app.input.setAuto($('opt-auto').checked);
  app.song = await loadSong(app.index.songs[$('song-select').selectedIndex]);   // [F5]
  app.roster.reset(app.song.notes);
  app.turn = 0;
  runTurn();
};

async function runTurn() {
  const p = app.roster.list[app.turn], n = app.roster.list.length;
  UI.showScreen('game');
  UI.setTitle(`${p.name} (${app.turn + 1}/${n})`);
  app.hasWav = await app.playback.prepare(app.song);                   // [F3]
  app.playback.start(app.song, { guide: $('opt-guide').checked });
  const ghost = app.turn > 0 ? app.roster.list[0].stats.hist : null;
  app.session = new Session({
    song: app.song, playback: app.playback, input: app.input, stats: p.stats,
    onFrame: (f) => {
      timeline.draw({ song: app.song, t: f.t, frame: f, ghost });
      UI.setLyric(f.t < app.song.countIn ? `Get ready... ${Math.ceil(app.song.countIn - f.t)}` : (f.note ? f.note.lyric : ''));
      UI.setHud([`Score ${p.stats.score}`, `Combo ${p.stats.combo}`,
        `You ${f.raw != null ? noteName(f.raw) : '--'}`, `Target ${f.note ? noteName(f.note.midi) : '--'}`,
        `${f.t.toFixed(1)}/${app.song.duration}s`, app.hasWav ? '' : 'synth backing (no wav)', app.micMsg]
        .filter(Boolean).join(' | '));
    },
    onEnd: onTurnEnd,
  });
  app.session.start();
}

function onTurnEnd() {
  if (app.turn < app.roster.list.length - 1) {                         // [F11] next device
    const done = app.roster.list[app.turn]; app.turn++;
    UI.renderIntermission(done.name, done.stats.score, app.roster.list[app.turn].name);
    UI.showScreen('intermission');
  } else {                                                             // [F13][F15]
    logResults(app.roster, app.song);
    UI.renderResults(app.roster.totals());
    UI.showScreen('results');
  }
}

$('btn-next').onclick = runTurn;
$('btn-stop').onclick = () => { app.session.stop(); UI.showScreen('setup'); };   // [F1] stop
$('btn-again').onclick = () => UI.showScreen('setup');

// ---- boot
(async () => {
  try { app.index = await loadIndex(); }                               // [F3]
  catch { UI.setStatus('Could not load songs/index.json. Run: python3 -m http.server 8000'); UI.showScreen('setup'); return; }
  UI.renderSongSelect(app.index.songs);
  redrawPlayers();
  UI.showScreen('setup');
})();
