// DOM helpers. [F1] controls   [F11] intermission   [F15][F16] score screen
export const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('hide', el.id !== `screen-${name}`));
}

export function renderSongSelect(songs) {                              // [F1] choose song
  $('song-select').innerHTML = songs.map((s) => `<option>${esc(s.title)}</option>`).join('');
}

export function renderPlayerList(roster, { onRename, onRemove }) {     // [F10][F11] device names
  const box = $('player-list'); box.innerHTML = '';
  roster.list.forEach((p, i) => {
    const row = document.createElement('div');
    const input = document.createElement('input');
    input.value = p.name; input.onchange = () => onRename(i, input.value);
    const rm = document.createElement('button');
    rm.textContent = '✕'; rm.onclick = () => onRemove(i);
    row.append(input, rm); box.append(row);
  });
}

export const setStatus = (t) => { $('status').textContent = t; };
export const setTitle = (t) => { $('game-title').textContent = t; };
export const setLyric = (t) => { $('lyric').textContent = t; };
export const setHud = (t) => { $('hud').textContent = t; };

export function renderIntermission(prevName, prevScore, nextName) {    // [F11]
  $('inter-text').innerHTML = `${esc(prevName)}: ${prevScore} pts<br>Pass the mic to ${esc(nextName)}`;
}

export function renderResults(totals) {                                // [F15][F16] name, score below
  const best = Math.max(...totals.map((t) => t.score));
  $('results-cards').innerHTML = totals.map((t) =>
    `<div class="card ${t.score === best ? 'winner' : ''}">
       <div class="name">${esc(t.name)}</div>
       <div class="score">${t.score}</div>
       <div class="sub">${t.accuracy}% acc · combo ${t.maxCombo}</div>
     </div>`).join('');
}
