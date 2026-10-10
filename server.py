"""
VocalStudio Server (Strictly Song Pipeline v2)
Serves index.html, streams v2 Song Library audio, and evaluates cover recordings using pipeline v2.
"""

import os
import sys
import json
import socket
import tempfile
import urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import numpy as np

WORKSPACE_DIR = Path(__file__).resolve().parent
V2_DIR = WORKSPACE_DIR / "song_pipeline_v2"
LIBRARY_DIR = V2_DIR / "Song Library"

if str(V2_DIR) not in sys.path:
    sys.path.insert(0, str(V2_DIR))

from audio_extractor import extract_song_data, load_song_data, save_song_data
from cover_evaluator import evaluate_cover

# Cleanup any stray non-v2 temporary feature files
stray_json = LIBRARY_DIR / "alphabet_song_short.json"
if stray_json.exists():
    try:
        stray_json.unlink()
    except Exception:
        pass


class NumpyEncoder(json.JSONEncoder):
    """Custom JSON encoder for numpy types."""
    def default(self, obj):
        if isinstance(obj, (np.integer, np.int64, np.int32)):
            return int(obj)
        elif isinstance(obj, (np.floating, np.float64, np.float32)):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


def get_local_ip():
    """Find the machine's local network IP for wireless phone connection."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def get_v2_song_catalog():
    """Scan song_pipeline_v2/Song Library dynamically for audio files and companion data."""
    catalog = {}
    audio_extensions = {".mp3", ".wav", ".m4a", ".flac", ".ogg"}

    if not LIBRARY_DIR.exists():
        return catalog

    for file_path in sorted(LIBRARY_DIR.iterdir()):
        if file_path.suffix.lower() in audio_extensions:
            song_id = file_path.stem
            json_path = LIBRARY_DIR / f"{song_id}.json"
            txt_path = LIBRARY_DIR / f"{song_id}.txt"

            title = song_id.replace("_", " ").title()
            duration = 0.0
            has_lyrics = False
            lyrics_preview = ""

            # Check for ground-truth lyrics text
            if txt_path.exists():
                has_lyrics = True
                try:
                    with open(txt_path, "r", encoding="utf-8") as f:
                        lines = [l.strip() for l in f if l.strip()]
                        lyrics_preview = " / ".join(lines[:3])
                except Exception:
                    pass

            # Check pre-extracted v2 feature json
            if json_path.exists():
                try:
                    with open(json_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        duration = data.get("duration_sec", 0.0)
                        if data.get("lyrics"):
                            has_lyrics = True
                            if not lyrics_preview:
                                lyrics_preview = " / ".join([line.get("text", "") for line in data.get("lyrics", [])[:3]])
                except Exception:
                    pass

            catalog[song_id] = {
                "id": song_id,
                "title": title,
                "duration": duration,
                "audio_path": file_path,
                "json_path": json_path if json_path.exists() else None,
                "lyrics_path": txt_path if txt_path.exists() else None,
                "has_lyrics": has_lyrics,
                "lyrics_preview": lyrics_preview or "Sing along with reference track"
            }

    return catalog


def ensure_v2_features(song_info: dict) -> dict:
    """Ensure v2 features exist for reference track."""
    json_path = song_info.get("json_path")
    audio_path = song_info.get("audio_path")

    if json_path and json_path.exists():
        return load_song_data(json_path)

    if audio_path and audio_path.exists():
        target_json = LIBRARY_DIR / f"{song_info['id']}.json"
        print(f"[v2 Pipeline] Extracting reference features for '{song_info['title']}'...")
        features = extract_song_data(audio_path, include_lyrics=False)
        save_song_data(features, target_json)
        return features

    raise FileNotFoundError(f"Audio file not found for song: {song_info.get('id')}")


class StudioV2RequestHandler(SimpleHTTPRequestHandler):
    """HTTP Request Handler serving web UI, v2 song library, and running v2 cover evaluations."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WORKSPACE_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/songs":
            self.handle_api_songs()
        elif path.startswith("/api/audio/"):
            self.handle_api_audio(path)
        elif path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok","pipeline":"v2"}')
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/compare":
            self.handle_api_compare(parsed)
        else:
            self.send_error(404, "Endpoint not found")

    def handle_api_songs(self):
        """Return song list strictly from song_pipeline_v2/Song Library."""
        catalog = get_v2_song_catalog()
        songs_list = []
        for song_id, item in catalog.items():
            songs_list.append({
                "id": item["id"],
                "title": item["title"],
                "duration": item["duration"],
                "has_lyrics": item["has_lyrics"],
                "lyrics_preview": item["lyrics_preview"],
                "audio_url": f"/api/audio/{item['id']}"
            })

        response_bytes = json.dumps(songs_list, indent=2).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.end_headers()
        self.wfile.write(response_bytes)

    def handle_api_audio(self, path: str):
        """Stream reference audio strictly from song_pipeline_v2/Song Library."""
        parts = [p for p in path.split("/") if p]
        # format: /api/audio/<song_id>
        if len(parts) < 3:
            self.send_error(400, "Invalid audio path")
            return

        song_id = parts[2]
        catalog = get_v2_song_catalog()
        song = catalog.get(song_id)

        if not song or not song["audio_path"].exists():
            self.send_error(404, f"Song '{song_id}' not found in v2 library")
            return

        file_path = song["audio_path"]
        ext = file_path.suffix.lower()
        content_type = "audio/mpeg" if ext == ".mp3" else "audio/wav"

        try:
            file_size = os.path.getsize(file_path)
            range_header = self.headers.get("Range")

            if range_header and range_header.startswith("bytes="):
                bytes_range = range_header.replace("bytes=", "").split("-")
                start = int(bytes_range[0]) if bytes_range[0] else 0
                end = int(bytes_range[1]) if bytes_range[1] else file_size - 1
                length = end - start + 1

                self.send_response(206)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                self.send_header("Content-Length", str(length))
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()

                with open(file_path, "rb") as f:
                    f.seek(start)
                    self.wfile.write(f.read(length))
            else:
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(file_size))
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()

                with open(file_path, "rb") as f:
                    while chunk := f.read(65536):
                        self.wfile.write(chunk)
        except Exception as e:
            print(f"[Audio Stream Error] {e}", file=sys.stderr)

    def handle_api_compare(self, parsed_url):
        """Compare user cover against song_pipeline_v2 reference song."""
        query_params = urllib.parse.parse_qs(parsed_url.query)
        song_id = query_params.get("song_id", ["alphabet_song"])[0]

        catalog = get_v2_song_catalog()
        song = catalog.get(song_id)
        if not song:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Unknown song '{song_id}' in v2 library"}).encode())
            return

        # Read uploaded cover audio
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                raise ValueError("Empty audio payload")

            audio_data = self.rfile.read(content_length)

            # Strip multipart boundary if present
            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" in content_type:
                boundary = content_type.split("boundary=")[-1].strip().encode()
                parts = audio_data.split(b"--" + boundary)
                for part in parts:
                    if b'filename="' in part:
                        header_end = part.find(b"\r\n\r\n")
                        if header_end != -1:
                            audio_data = part[header_end + 4:].rstrip(b"\r\n")
                            break

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
                tmp_file.write(audio_data)
                tmp_path = tmp_file.name

        except Exception as e:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Failed to read audio: {str(e)}"}).encode())
            return

        try:
            print(f"\n[v2 Evaluator] Evaluating cover ({len(audio_data)} bytes) against v2 '{song['title']}'...")

            # 1. Load pipeline v2 reference data
            ref_data = ensure_v2_features(song)

            # 2. Extract cover features using v2 audio_extractor
            cover_data = extract_song_data(tmp_path, include_lyrics=False)

            # 3. Evaluate cover accuracy using v2 cover_evaluator
            results = evaluate_cover(ref_data, cover_data)
            results["song_title"] = song["title"]
            results["reference_duration"] = ref_data.get("duration_sec", song["duration"])
            results["cover_duration"] = cover_data.get("duration_sec", 0.0)

            print(f"[v2 Evaluator] Result: Score {results['overall_score']} | Grade {results['letter_grade']} | Pitch {results['pitch_score']}%")

            response_bytes = json.dumps(results, cls=NumpyEncoder).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response_bytes)))
            self.end_headers()
            self.wfile.write(response_bytes)

        except Exception as e:
            print(f"[Evaluation Error] {e}", file=sys.stderr)
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Evaluation error: {str(e)}"}).encode())

        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass


def main():
    port = int(os.environ.get("PORT", 8000))
    local_ip = get_local_ip()

    server_address = ("0.0.0.0", port)
    httpd = ThreadingHTTPServer(server_address, StudioV2RequestHandler)

    print("\n" + "=" * 65)
    print(" 🎤  VOCALSTUDIO (SONG PIPELINE V2 ONLY)")
    print("=" * 65)
    print(f"  💻  Laptop Studio URL:   http://localhost:{port}")
    print(f"  📱  Phone Wireless Mic:  http://{local_ip}:{port}")
    print("=" * 65)
    print("  Using Song Library: song_pipeline_v2/Song Library")
    print("=" * 65 + "\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()


if __name__ == "__main__":
    main()
