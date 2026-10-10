# Hacklanta 26: Song Pipelines & Note Detection

This repository contains audio processing pipelines for pitch detection, song cover accuracy rating, and real-time audio interaction:

- **`song_pipeline_v1/`**: Web-based multiplayer song player and library builder.
- **`song_pipeline_v2/`**: AI-powered lyric-aligned song cover accuracy rating engine (Whisper transcription + DTW alignment + pitch & note grading).
- **`app.py`**: Real-time terminal microphone note detector.

---

## Song Pipeline v2 Quick Start

### 1. Setup Virtual Environment
```bash
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Run Accuracy Evaluation
```bash
# Run self-test verification
python song_pipeline_v2/compare.py

# Compare against a user cover audio file
python song_pipeline_v2/compare.py --cover "path/to/user_cover.wav"

# Record live from microphone (30 seconds)
python song_pipeline_v2/compare.py --record 30
```

For full architecture and module documentation, see [`song_pipeline_v2/README.md`](song_pipeline_v2/README.md).
