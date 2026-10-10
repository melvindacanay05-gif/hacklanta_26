import os
import sys
import json
import uuid
import tempfile
import asyncio
from pathlib import Path
from typing import Dict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, File, UploadFile, Form
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
import numpy as np
from pydantic import BaseModel

WORKSPACE_DIR = Path(__file__).resolve().parent
V2_DIR = WORKSPACE_DIR / "song_pipeline_v2"
LIBRARY_DIR = V2_DIR / "Song Library"

if str(V2_DIR) not in sys.path:
    sys.path.insert(0, str(V2_DIR))

from audio_extractor import extract_song_data, load_song_data, save_song_data
from cover_evaluator import evaluate_cover

app = FastAPI()

# custom encoder
class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.integer, np.int64, np.int32)):
            return int(obj)
        elif isinstance(obj, (np.floating, np.float64, np.float32)):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)

def get_v2_song_catalog():
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

            if txt_path.exists():
                has_lyrics = True
                try:
                    with open(txt_path, "r", encoding="utf-8") as f:
                        lines = [l.strip() for l in f if l.strip()]
                        lyrics_preview = " / ".join(lines[:3])
                except Exception:
                    pass

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
    json_path = song_info.get("json_path")
    audio_path = song_info.get("audio_path")

    if json_path and json_path.exists():
        return load_song_data(json_path)

    if audio_path and audio_path.exists():
        target_json = LIBRARY_DIR / f"{song_info['id']}.json"
        features = extract_song_data(audio_path, include_lyrics=False)
        save_song_data(features, target_json)
        return features
    raise FileNotFoundError(f"Audio file not found for song: {song_info.get('id')}")

# --- Matchmaking & WebSockets ---
class Player:
    def __init__(self, ws: WebSocket, player_id: str):
        self.ws = ws
        self.id = player_id
        self.room: "Room" = None

class Room:
    def __init__(self, room_id: str, p1: Player, p2: Player):
        self.room_id = room_id
        self.p1 = p1
        self.p2 = p2
        self.state = "song_selection"
        self.song_id = None
        self.p1_results = None
        self.p2_results = None

    async def broadcast(self, message: dict):
        try:
            await self.p1.ws.send_json(message)
        except: pass
        try:
            await self.p2.ws.send_json(message)
        except: pass

class ConnectionManager:
    def __init__(self):
        self.queue: list[Player] = []
        self.rooms: dict[str, Room] = {}
        self.players: dict[str, Player] = {}

    async def connect(self, ws: WebSocket, player_id: str):
        await ws.accept()
        player = Player(ws, player_id)
        self.players[player_id] = player
        self.queue.append(player)
        print(f"Player {player_id} connected. Queue size: {len(self.queue)}")
        
        await self.try_matchmaking()

    async def try_matchmaking(self):
        while len(self.queue) >= 2:
            p1 = self.queue.pop(0)
            p2 = self.queue.pop(0)
            room_id = str(uuid.uuid4())
            room = Room(room_id, p1, p2)
            p1.room = room
            p2.room = room
            self.rooms[room_id] = room
            
            print(f"Room {room_id} created with {p1.id} and {p2.id}")
            await room.broadcast({
                "type": "matched",
                "room_id": room_id,
                "p1_id": p1.id,
                "p2_id": p2.id,
                "state": "song_selection",
                "turn": p1.id
            })

    async def disconnect(self, player_id: str):
        if player_id in self.players:
            player = self.players.pop(player_id)
            if player in self.queue:
                self.queue.remove(player)
            if player.room:
                room = player.room
                await room.broadcast({"type": "opponent_disconnected"})
                if room.room_id in self.rooms:
                    del self.rooms[room.room_id]

    async def handle_message(self, player_id: str, data: dict):
        player = self.players.get(player_id)
        if not player or not player.room:
            return
        
        room = player.room
        msg_type = data.get("type")

        if msg_type == "song_selected":
            if player.id == room.p1.id:
                room.song_id = data.get("song_id")
                room.state = "turn_p1"
                await room.broadcast({
                    "type": "turn_p1",
                    "song_id": room.song_id,
                    "singer": room.p1.id
                })
        
        elif msg_type == "finish_p1_turn":
            if player.id == room.p1.id:
                room.state = "turn_p2"
                await room.broadcast({
                    "type": "turn_p2",
                    "singer": room.p2.id
                })
        
        elif msg_type == "finish_p2_turn":
            if player.id == room.p2.id:
                room.state = "results"
                await self.check_results_ready(room)

        elif msg_type == "rtc_signal":
            target_id = data.get("target")
            target = room.p1 if target_id == room.p1.id else room.p2
            if target and target.ws:
                await target.ws.send_json({
                    "type": "rtc_signal",
                    "sender": player.id,
                    "signal": data.get("signal")
                })

    async def check_results_ready(self, room: Room):
        if room.p1_results and room.p2_results:
            await room.broadcast({
                "type": "game_over",
                "p1_results": room.p1_results,
                "p2_results": room.p2_results
            })

manager = ConnectionManager()

@app.websocket("/ws/{player_id}")
async def websocket_endpoint(websocket: WebSocket, player_id: str):
    await manager.connect(websocket, player_id)
    try:
        while True:
            data = await websocket.receive_json()
            await manager.handle_message(player_id, data)
    except WebSocketDisconnect:
        await manager.disconnect(player_id)


# --- REST API ---
@app.get("/api/songs")
async def get_songs():
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
    return JSONResponse(songs_list)

@app.get("/api/audio/{song_id}")
async def get_audio(song_id: str, request: Request):
    catalog = get_v2_song_catalog()
    song = catalog.get(song_id)
    if not song or not song["audio_path"].exists():
        return JSONResponse({"error": "Not found"}, status_code=404)
    
    # We can use FastAPI's FileResponse, it handles range requests automatically!
    return FileResponse(song["audio_path"])

@app.post("/api/evaluate")
async def evaluate_cover_api(
    player_id: str = Form(...),
    song_id: str = Form(...),
    audio: UploadFile = File(...)
):
    catalog = get_v2_song_catalog()
    song = catalog.get(song_id)
    if not song:
        return JSONResponse({"error": "Unknown song"}, status_code=400)

    # Save uploaded file
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Run CPU heavy task in thread pool
        def evaluate():
            ref_data = ensure_v2_features(song)
            cover_data = extract_song_data(tmp_path, include_lyrics=False)
            results = evaluate_cover(ref_data, cover_data)
            results["song_title"] = song["title"]
            return results
        
        results = await asyncio.to_thread(evaluate)
        
        # Clean numpy types
        clean_results = json.loads(json.dumps(results, cls=NumpyEncoder))
        
        # If part of a room, attach results to room
        player = manager.players.get(player_id)
        if player and player.room:
            room = player.room
            if player_id == room.p1.id:
                room.p1_results = clean_results
            else:
                room.p2_results = clean_results
            
            # check if both are done (could happen if evaluation takes long)
            if room.state == "results":
                await manager.check_results_ready(room)

        return JSONResponse(clean_results)

    except Exception as e:
        print(f"Evaluate error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


# Serve index.html and static files
@app.get("/")
async def root():
    return FileResponse(WORKSPACE_DIR / "index.html")

app.mount("/", StaticFiles(directory=WORKSPACE_DIR), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
