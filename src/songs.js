// [F3] song repo lookup via index   [F5] retrieve song.json
export async function loadIndex() {
  const res = await fetch('songs/index.json');
  if (!res.ok) throw new Error('index.json not found');
  return res.json();
}

export async function loadSong(entry) {
  const base = `songs/${entry.folder}/`;
  const res = await fetch(base + 'song.json');
  if (!res.ok) throw new Error('song.json not found');
  const song = await res.json();
  song.base = base; // used to locate instrumental.wav
  return song;
}
