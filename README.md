# Terminal Note Detector

Listens to your default microphone and prints detected notes with elapsed time.

Example:
```text
Listening. Press Ctrl+C to stop.
Elapsed | Note | Frequency
---------------------------
00:00.51 |  A4 |   440.3 Hz
00:01.52 |  C5 |   523.1 Hz
```

## Windows / VS Code
Use Python 3.11:
```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```
Press Ctrl+C to stop.

This uses pitch estimation rather than a pretrained sound classifier because the goal is to identify notes. It prints only when the note changes. Best with one sustained note at a time; chords and background sounds can confuse it.

To list microphone devices:
```powershell
python -c "import sounddevice as sd; print(sd.query_devices())"
```
