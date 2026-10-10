# Song Pipeline v2: AI Lyric-Aligned Pitch & Cover Accuracy Rating Engine

Extracts pitch contours and discrete musical notes from reference songs, transcribes lyrics with word-level timestamps using OpenAI Whisper, and scores user covers based on pitch accuracy, timing, and lyric synchronization.

---

## Architecture Overview

1. **Audio Feature Extraction (`audio_extractor.py`)**:
   - Uses `librosa.effects.hpss` (harmonic-percussive separation) to isolate melodic singing vocals.
   - Applies probabilistic YIN (`librosa.pyin`) for fine-grained fundamental frequency ($f_0$) and MIDI pitch tracking.
   - Segments stable pitches into discrete musical notes (`note`, `midi`, `pitch_hz`, `start`, `end`).

2. **Lyrics Transcription & Pitch Alignment (`lyrics_transcriber.py`)**:
   - Runs OpenAI Whisper with `word_timestamps=True` guided by ground-truth reference lyrics files (`.txt`/`.lrc`).
   - Filters out non-singing watermarks (e.g. stock audio tags).
   - Maps each transcribed word directly to its expected singing pitch and note.

3. **Cover Comparison Engine (`cover_evaluator.py`)**:
   - **Dynamic Time Warping (DTW)**: Compensates for human timing variations, rubato, and delays.
   - **Octave Normalization**: Automatically normalizes cross-gender vocal ranges (e.g., singing 1 octave lower).
   - **Lyric-by-Lyric Accuracy**: Compares the user's sung pitch at the exact timestamp of every lyric word.
   - **Performance Grade & Feedback**: Produces a weighted score (0–100), letter grade (S, A, B, C, D, F), and actionable feedback.

4. **CLI Runner (`compare.py`)**:
   - Evaluate pre-recorded cover files, record live from microphone, or inspect lyric pitch tables.

---

## Usage

```bash
# Activate virtual environment
source .venv/bin/activate

# 1. Self-test against reference song
python song_pipeline_v2/compare.py

# 2. Evaluate a cover audio file
python song_pipeline_v2/compare.py --reference "song_pipeline_v2/Song Library/alphabet_song.json" --cover "my_cover.wav"

# 3. Record live cover from microphone (30 seconds)
python song_pipeline_v2/compare.py --reference "song_pipeline_v2/Song Library/alphabet_song.json" --record 30

# 4. Extract new reference song
python song_pipeline_v2/compare.py --reference "path/to/song.mp3" --extract-only
```
