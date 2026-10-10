/**
 * Host Screen Controller (Discrete Notes Edition)
 * Features:
 * - Loads catalog dynamically from /api/songs (library/index.json)
 * - Rock Band rounded note bar canvas renderer (60fps)
 * - Live multiplayer pitch tracker & leaderboard
 */

const PLAYER_COLORS = [
    "#00dfd8", "#ff0080", "#00f279", "#f5a623",
    "#9d4edd", "#ff5400", "#70e000", "#38b000"
];

class HostScreenController {
    constructor() {
        this.roomId = "PARTY1";
        this.socket = null;
        this.songData = null;
        this.isPlaying = false;
        this.playersMap = new Map();

        // DOM Elements
        this.audioPlayer = document.getElementById("audio-player");
        this.startBtn = document.getElementById("start-song-btn");
        this.stopBtn = document.getElementById("stop-song-btn");
        this.songSelect = document.getElementById("song-select");
        this.currentPhraseEl = document.getElementById("current-phrase");
        this.nextPhraseEl = document.getElementById("next-phrase");
        this.leaderboardList = document.getElementById("leaderboard-list");
        this.playerCountBadge = document.getElementById("player-count-badge");
        this.canvas = document.getElementById("pitch-ribbon");
        this.ctx = this.canvas.getContext("2d");

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.connectWebSocket();
        await this.loadSongCatalog();
        this.startRenderLoop();
    }

    setupEventListeners() {
        this.startBtn.addEventListener("click", () => this.startPlayback());
        this.stopBtn.addEventListener("click", () => this.stopPlayback());
        this.songSelect.addEventListener("change", () => this.loadSelectedSong());

        this.audioPlayer.addEventListener("ended", () => {
            this.stopPlayback();
        });
    }

    async loadSongCatalog() {
        try {
            const resp = await fetch("/api/songs");
            const songs = await resp.json();

            if (songs.length > 0) {
                this.songSelect.innerHTML = songs.map(s => `
                    <option value="${s.id}">${s.title} (${s.artist || 'Demo'})</option>
                `).join("");
                await this.loadSelectedSong();
            } else {
                this.songSelect.innerHTML = `<option value="">No songs in library/ yet</option>`;
            }
        } catch (err) {
            console.error("Failed to load /api/songs:", err);
        }
    }

    async loadSelectedSong() {
        const songId = this.songSelect.value;
        if (!songId) return;

        try {
            const resp = await fetch(`/library/${songId}/song.json`);
            this.songData = await resp.json();
            const instFile = this.songData.instrumental || "instrumental.wav";
            this.audioPlayer.src = `/library/${songId}/${instFile}`;
            this.currentPhraseEl.innerText = this.songData.title;
            this.nextPhraseEl.innerText = `BPM: ${this.songData.bpm || '--'} • Duration: ${this.songData.duration || '--'}s`;
        } catch (err) {
            console.error("Failed to load song.json:", err);
        }
    }

    connectWebSocket() {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws/host/${this.roomId}`;
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log("[Host] Connected to room:", this.roomId);
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };

        this.socket.onclose = () => {
            console.warn("[Host] Disconnected. Reconnecting in 2s...");
            setTimeout(() => this.connectWebSocket(), 2000);
        };
    }

    handleServerMessage(data) {
        switch (data.type) {
            case "player_joined":
            case "player_left":
            case "host_leaderboard_update":
                this.updatePlayers(data.players || []);
                break;
        }
    }

    updatePlayers(playerList) {
        this.playerCountBadge.innerText = `${playerList.length} singer${playerList.length === 1 ? '' : 's'}`;

        playerList.forEach((p, idx) => {
            if (!this.playersMap.has(p.name)) {
                this.playersMap.set(p.name, {
                    ...p,
                    color: PLAYER_COLORS[idx % PLAYER_COLORS.length]
                });
            } else {
                const existing = this.playersMap.get(p.name);
                this.playersMap.set(p.name, { ...existing, ...p });
            }
        });

        if (playerList.length === 0) {
            this.leaderboardList.innerHTML = `
                <li class="leaderboard-item" style="color: var(--text-muted); justify-content: center;">
                    Waiting for singers to join...
                </li>`;
            return;
        }

        const sorted = [...this.playersMap.values()].sort((a, b) => (b.score || 0) - (a.score || 0));
        this.leaderboardList.innerHTML = sorted.map((p, idx) => `
            <li class="leaderboard-item">
                <span class="player-rank">#${idx + 1}</span>
                <div class="player-details">
                    <span class="player-name-text" style="color: ${p.color || '#fff'}">${p.name}</span>
                    <span class="player-subtext">Streak: ${p.streak || 0}x • ${p.last_rating || 'READY'}</span>
                </div>
                <span class="player-score-text">${(p.score || 0).toLocaleString()}</span>
            </li>
        `).join("");
    }

    startPlayback() {
        if (!this.songData) return;
        this.isPlaying = true;
        this.startBtn.classList.add("hidden");
        this.stopBtn.classList.remove("hidden");

        this.audioPlayer.currentTime = 0;
        this.audioPlayer.play();

        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: "start_song",
                song_id: this.songData.id,
            }));
        }
    }

    stopPlayback() {
        this.isPlaying = false;
        this.startBtn.classList.remove("hidden");
        this.stopBtn.classList.add("hidden");
        this.audioPlayer.pause();

        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: "stop_song"
            }));
        }

        this.currentPhraseEl.innerText = "Song Finished!";
        this.nextPhraseEl.innerText = "Check final scores on the leaderboard!";
    }

    startRenderLoop() {
        const render = () => {
            const currentTime = this.audioPlayer.currentTime || 0;
            this.drawPitchRibbon(currentTime);
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }

    drawPitchRibbon(currentTime) {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const ctx = this.ctx;

        // Clear canvas
        ctx.fillStyle = "#0c0a18";
        ctx.fillRect(0, 0, width, height);

        // Parameters
        const timeWindowSec = 4.0;
        const pastOffsetSec = 1.0;
        const nowX = (pastOffsetSec / timeWindowSec) * width; // Playhead line at ~250px

        // Determine MIDI range
        let minMidi = 48; // C3
        let maxMidi = 72; // C5
        if (this.songData && this.songData.notes && this.songData.notes.length > 0) {
            const allMidis = this.songData.notes.map(n => n.midi);
            minMidi = Math.min(...allMidis) - 2;
            maxMidi = Math.max(...allMidis) + 2;
        }
        const midiRange = Math.max(12, maxMidi - minMidi);

        const midiToY = (midi) => {
            const norm = (midi - minMidi) / midiRange;
            return height - (norm * (height - 40) + 20);
        };

        // 1. Draw horizontal pitch guide grid lines
        ctx.strokeStyle = "#1a1630";
        ctx.lineWidth = 1;
        for (let m = Math.floor(minMidi); m <= Math.ceil(maxMidi); m++) {
            const y = midiToY(m);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // 2. Draw Target Melody Note Bars (Rock Band style rounded pills!)
        if (this.songData && this.songData.notes) {
            const notes = this.songData.notes;
            const startTime = currentTime - pastOffsetSec;
            const endTime = currentTime + (timeWindowSec - pastOffsetSec);

            for (let i = 0; i < notes.length; i++) {
                const n = notes[i];
                if (n.end >= startTime && n.start <= endTime) {
                    const x = ((n.start - startTime) / timeWindowSec) * width;
                    const w = Math.max(16, ((n.end - n.start) / timeWindowSec) * width);
                    const y = midiToY(n.midi);

                    // Note block gradient
                    const isPassed = n.end < currentTime;
                    ctx.save();
                    if (!isPassed) {
                        ctx.shadowColor = "#ff0080";
                        ctx.shadowBlur = 10;
                    }
                    ctx.fillStyle = isPassed ? "#3d2a45" : "#7928ca";

                    // Rounded note rectangle
                    this.roundRect(ctx, x, y - 8, w, 16, 6, true, false);
                    ctx.restore();
                }
            }
        }

        // 3. Draw vertical "NOW" playhead line
        ctx.strokeStyle = "rgba(0, 223, 216, 0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(nowX, 0);
        ctx.lineTo(nowX, height);
        ctx.stroke();

        // 4. Draw Player Sung Pitch Dots
        for (const [name, p] of this.playersMap.entries()) {
            if (p.is_singing && p.current_midi) {
                // Octave-fold player midi to the reference range for visual overlay
                let displayMidi = p.current_midi;
                while (displayMidi < minMidi) displayMidi += 12;
                while (displayMidi > maxMidi) displayMidi -= 12;

                const py = midiToY(displayMidi);

                ctx.save();
                ctx.shadowColor = p.color || "#00dfd8";
                ctx.shadowBlur = 15;
                ctx.fillStyle = p.color || "#00dfd8";
                ctx.beginPath();
                ctx.arc(nowX, py, 9, 0, Math.PI * 2);
                ctx.fill();

                // Player name label
                ctx.font = "bold 11px sans-serif";
                ctx.fillStyle = "#ffffff";
                ctx.fillText(p.name, nowX + 14, py + 4);
                ctx.restore();
            }
        }
    }

    roundRect(ctx, x, y, width, height, radius, fill, stroke) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
    }
}

window.addEventListener("DOMContentLoaded", () => {
    new HostScreenController();
});
