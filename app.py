"""Real-time note detector: prints changed notes with elapsed timestamps and the source device.
Audio comes from phones via the website (forwarded to ws://localhost:8765).
pip install aiohttp librosa numpy
"""
import asyncio
import queue
import threading
import time

import librosa
import numpy as np
import sounddevice as sd
from aiohttp import web, WSMsgType

USE_LAPTOP_MIC = True        # also listen to this laptop's own mic, labeled "Laptop"
SAMPLE_RATE = 22050          # the website sends audio at this rate
WINDOW_SECONDS = 0.5
MIN_RMS = 0.008
MIN_HZ, MAX_HZ = 55, 1500
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
PORT = 8765

started = time.monotonic()
print_lock = threading.Lock()
active_names = set()

# ---------- your original detector ----------
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

# ---------- one worker per connected device ----------
def device_worker(name, q, stop):
    window_size = int(SAMPLE_RATE * WINDOW_SECONDS)
    pending = np.empty(0, dtype=np.float32)
    last_note = None
    while not stop.is_set():
        try:
            pending = np.concatenate([pending, q.get(timeout=0.5)])
        except queue.Empty:
            continue
        while len(pending) >= window_size:
            window, pending = pending[:window_size], pending[window_size:]
            result = detect_note(window)
            if result is None:
                last_note = None
                continue
            note, hz = result
            if note != last_note:
                minutes, seconds = divmod(time.monotonic() - started, 60)
                with print_lock:
                    print(f"{int(minutes):02d}:{seconds:05.2f} | {name:<12} | {note:>3} | {hz:7.1f} Hz",
                          flush=True)
                last_note = note

async def ws_handler(request):
    base = (request.query.get("name", "Phone").strip() or "Phone")[:10]
    name, i = base, 2
    while name in active_names:          # make duplicate names unique
        name = f"{base} {i}"
        i += 1
    active_names.add(name)
    q, stop = queue.Queue(), threading.Event()
    threading.Thread(target=device_worker, args=(name, q, stop), daemon=True).start()

    ws = web.WebSocketResponse()
    await ws.prepare(request)
    with print_lock:
        print(f"-- {name} connected --", flush=True)
    try:
        async for msg in ws:
            if msg.type == WSMsgType.BINARY:
                q.put(np.frombuffer(msg.data, dtype=np.float32))
    finally:
        stop.set()
        active_names.discard(name)
        with print_lock:
            print(f"-- {name} disconnected --", flush=True)
    return ws

def start_server():
    async def serve():
        app = web.Application()
        app.add_routes([web.get("/ws", ws_handler)])
        runner = web.AppRunner(app)
        await runner.setup()
        await web.TCPSite(runner, "127.0.0.1", PORT).start()
        await asyncio.Event().wait()
    threading.Thread(target=lambda: asyncio.run(serve()), daemon=True).start()

def start_laptop_mic():
    """Feed this laptop's default mic into its own detector, labeled 'Laptop'."""
    name = "Laptop"
    active_names.add(name)               # so a phone named "Laptop" becomes "Laptop 2"
    q = queue.Queue()
    stop = threading.Event()
    threading.Thread(target=device_worker, args=(name, q, stop), daemon=True).start()

    def callback(indata, frames, time_info, status):
        q.put(indata[:, 0].copy())

    try:
        stream = sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32",
                                callback=callback)
        stream.start()
        return stream
    except Exception as exc:
        print(f"Couldn't open the laptop mic ({exc}). Continuing with phones only.")
        stop.set()
        active_names.discard(name)
        return None

def main():
    start_server()
    mic = start_laptop_mic() if USE_LAPTOP_MIC else None
    print(f"Waiting for devices via the website (ws://localhost:{PORT}). Ctrl+C to stop.")
    if mic:
        print("Laptop mic is on.")
    print("Elapsed | Device       | Note | Frequency")
    print("------------------------------------------")
    try:
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        if mic:
            mic.stop()
            mic.close()

if __name__ == "__main__":
    main()