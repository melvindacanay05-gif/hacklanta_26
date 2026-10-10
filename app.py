"""Real-time note detector: prints changed notes with elapsed timestamps."""
import time
import librosa
import numpy as np
import sounddevice as sd

SAMPLE_RATE = 22050
WINDOW_SECONDS = 0.5
MIN_RMS = 0.008
MIN_HZ, MAX_HZ = 55, 1500
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

def detect_note(audio):
    audio = audio.astype(np.float32)
    if len(audio) == 0 or np.sqrt(np.mean(audio ** 2)) < MIN_RMS:
        return None
    pitches = librosa.yin(audio, fmin=MIN_HZ, fmax=MAX_HZ, sr=SAMPLE_RATE)
    pitches = pitches[np.isfinite(pitches)]
    pitches = pitches[(pitches >= MIN_HZ) & (pitches <= MAX_HZ)]
    if not len(pitches):
        return None
    hz = float(np.median(pitches))
    midi = int(round(float(librosa.hz_to_midi(hz))))
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}", hz

def main():
    window_size = int(SAMPLE_RATE * WINDOW_SECONDS)
    started = time.monotonic()
    last_note = None
    print("Listening. Press Ctrl+C to stop.")
    print("Elapsed | Note | Frequency")
    print("---------------------------")
    try:
        with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32",
                            blocksize=window_size) as stream:
            while True:
                audio, overflowed = stream.read(window_size)
                if overflowed:
                    continue
                result = detect_note(audio[:, 0])
                if result is None:
                    last_note = None
                    continue
                note, hz = result
                if note != last_note:
                    elapsed = time.monotonic() - started
                    minutes, seconds = divmod(elapsed, 60)
                    print(f"{int(minutes):02d}:{seconds:05.2f} | {note:>3} | {hz:7.1f} Hz", flush=True)
                    last_note = note
    except KeyboardInterrupt:
        print("\nStopped.")
    except Exception as exc:
        print(f"\nAudio error: {exc}")
        print("Check microphone permissions and your default input device.")

if __name__ == "__main__":
    main()
