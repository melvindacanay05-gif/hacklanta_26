"""
Audio to Song Data Converter (Minimal Edition)
----------------------------------------------
Reads audio files from `raw_songs/`, extracts melody notes and BPM,
and outputs clean JSON files in `library/` for your teammates to use.
"""

import json
import pathlib
import shutil
import librosa
import numpy as np

RAW_DIR = pathlib.Path("raw_songs")
LIB_DIR = pathlib.Path("library")

RAW_DIR.mkdir(exist_ok=True)
LIB_DIR.mkdir(exist_ok=True)

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

def midi_to_note_name(midi):
    """Converts a MIDI number like 60 -> 'C4', 69 -> 'A4'."""
    return f"{NOTE_NAMES[round(midi) % 12]}{(round(midi) // 12) - 1}"

def pitch_curve_to_notes(times, midis, min_dur=0.12, max_drift=0.75):
    """Groups continuous pitch frames into discrete note blocks."""
    notes = []
    seg_times, seg_midis = [], []

    def save_note():
        if seg_times and (seg_times[-1] - seg_times[0]) >= min_dur:
            med_midi = int(round(float(np.median(seg_midis))))
            notes.append({
                "start": round(float(seg_times[0]), 2),
                "end": round(float(seg_times[-1]), 2),
                "midi": med_midi,
                "note": midi_to_note_name(med_midi),
                "hz": round(440.0 * (2.0 ** ((med_midi - 69) / 12)), 2)
            })

    for t, m in zip(times, midis):
        if not np.isnan(m) and m > 35:  # Sound is voiced
            if seg_times and abs(m - np.median(seg_midis)) > max_drift:
                save_note()
                seg_times, seg_midis = [], []
            seg_times.append(t)
            seg_midis.append(m)
        else:
            save_note()
            seg_times, seg_midis = [], []

    save_note()
    return notes

def process_song(audio_path):
    """Extracts notes, BPM, and saves a ready-to-use folder for teammates."""
    title = audio_path.stem.replace("_", " ").title()
    song_id = f"song_{audio_path.stem.lower()}"
    song_dir = LIB_DIR / song_id
    song_dir.mkdir(parents=True, exist_ok=True)

    print(f"[*] Processing: {title} ({audio_path.name})")

    # 1. Load audio
    y, sr = librosa.load(str(audio_path), sr=22050, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))

    # 2. Extract pitch notes using pYIN
    f0, voiced, _ = librosa.pyin(
        y, fmin=float(librosa.note_to_hz("C2")), fmax=float(librosa.note_to_hz("C7")), sr=sr
    )
    times = librosa.times_like(f0, sr=sr)
    midis = np.where(voiced & (f0 > 0), 69 + 12 * np.log2(f0 / 440.0), np.nan)
    notes = pitch_curve_to_notes(times, midis)

    # 3. Detect tempo (BPM)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = round(float(np.atleast_1d(tempo)[0]), 1)

    # 4. Copy audio file into song directory
    dest_audio = song_dir / audio_path.name
    if audio_path.resolve() != dest_audio.resolve():
        shutil.copyfile(audio_path, dest_audio)

    # 5. Save clean song.json
    song_data = {
        "id": song_id,
        "title": title,
        "bpm": bpm,
        "duration": round(duration, 2),
        "audio_file": audio_path.name,
        "total_notes": len(notes),
        "notes": notes  # [{start, end, midi, note, hz}, ...]
    }

    with open(song_dir / "song.json", "w", encoding="utf-8") as f:
        json.dump(song_data, f, indent=2)

    print(f"    [OK] Notes: {len(notes)} | BPM: {bpm} | Duration: {duration:.1f}s")
    return song_data

def rebuild_index():
    """Builds a simple index.json list of all songs in library/."""
    index = []
    for f in LIB_DIR.glob("*/song.json"):
        with open(f, "r", encoding="utf-8") as fp:
            d = json.load(fp)
            index.append({
                "id": d["id"],
                "title": d["title"],
                "bpm": d["bpm"],
                "duration": d["duration"],
                "total_notes": d["total_notes"]
            })

    with open(LIB_DIR / "index.json", "w", encoding="utf-8") as fp:
        json.dump(index, fp, indent=2)

    print(f"\n[OK] library/index.json updated with {len(index)} song(s).")

if __name__ == "__main__":
    audio_files = list(RAW_DIR.glob("*.mp3")) + list(RAW_DIR.glob("*.wav")) + list(RAW_DIR.glob("*.m4a"))
    if not audio_files:
        print("[!] No audio files in 'raw_songs/'. Drop an .mp3 or .wav and run again.")
    else:
        for audio in audio_files:
            process_song(audio)
        rebuild_index()