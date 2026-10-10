# Hacklanta 26: Song Pipelines & Note Detection

This repository contains audio processing pipelines for pitch detection, song cover accuracy rating, and real-time audio interaction:

- **`server.py` & `index.html`**: Web-based wireless phone microphone studio & live cover evaluator.
- **`song_pipeline_v1/`**: Web-based multiplayer song player and library builder.
- **`song_pipeline_v2/`**: AI-powered lyric-aligned song cover accuracy rating engine (Whisper transcription + DTW alignment + pitch & note grading).
- **`app.py`**: Real-time terminal microphone note detector.

---

## Web Studio: Phone Mic Recording & AI Cover Evaluator

### 1. Launch the Local Studio Server
```bash
source .venv/bin/activate
python server.py
```

The server will print:
- **💻 Laptop Studio URL**: `http://localhost:8000`
- **📱 Phone Mic URL**: `http://<your-local-ip>:8000`

### 2. Connect & Record
1. Open `http://localhost:8000` on your laptop and choose **"Laptop Studio"** (displays a 4-digit code).
2. Open `http://<your-local-ip>:8000` on your phone, choose **"Phone Microphone"**, and enter the 4-digit code.
3. Select any song from your library (e.g. *Alphabet Song*, *Twinkle Twinkle Little Star*).
4. Hit **"Start Recording"** (on laptop or directly from the phone remote) to sing along with the backing track.
5. Hit **"Stop & Compare Cover"** to receive an instant AI evaluation with letter grade (S–F), pitch accuracy, timing alignment, notes breakdown, and word-by-word pitch comparison.

---

## Song Pipeline v2 Quick Start (CLI)

### 1. Setup Virtual Environment
```bash
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Run Accuracy Evaluation (CLI)
```bash
# Run self-test verification
python song_pipeline_v2/compare.py

# Compare against a user cover audio file
python song_pipeline_v2/compare.py --cover "path/to/user_cover.wav"

# Record live from microphone (30 seconds)
python song_pipeline_v2/compare.py --record 30
```

For full architecture and module documentation, see [`song_pipeline_v2/README.md`](song_pipeline_v2/README.md).

