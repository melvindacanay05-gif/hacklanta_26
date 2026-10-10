/**
 * Mobile Player Pitch Detector & WebSocket Client
 * Author: CS Freshman / Team
 * Features:
 * - Web Audio API getUserMedia (mic capture)
 * - Pure JS Autocorrelation pitch detection (zero npm/bundler dependencies)
 * - RMS silence and background noise gating
 * - Sub-harmonic parabolic peak interpolation
 * - Real-time WebSocket streaming to server (~20 Hz)
 * - Instant visual feedback (mic gauge, pitch note, score popups)
 */

class PitchDetector {
    constructor(sampleRate) {
        this.sampleRate = sampleRate;
        this.minFreq = 65.0;   // ~C2 (lowest bass note)
        this.maxFreq = 1050.0; // ~C6 (soprano high C)
        this.minLag = Math.floor(this.sampleRate / this.maxFreq);
        this.maxLag = Math.floor(this.sampleRate / this.minFreq);
    }

    computeRMS(buffer) {
        let sumSquares = 0.0;
        for (let i = 0; i < buffer.length; i++) {
            sumSquares += buffer[i] * buffer[i];
        }
        return Math.sqrt(sumSquares / buffer.length);
    }

    detect(buffer) {
        const rms = this.computeRMS(buffer);
        // Gate out silence or very faint ambient room noise
        if (rms < 0.015) {
            return { hz: 0, midi: null, confidence: 0, rms, voiced: false };
        }

        const size = buffer.length;
        let maxLag = Math.min(this.maxLag, Math.floor(size / 2));
        let bestLag = -1;
        let bestCorrelation = 0;

        // Autocorrelation pass
        for (let lag = this.minLag; lag <= maxLag; lag++) {
            let correlation = 0;
            let normA = 0;
            let normB = 0;
            for (let i = 0; i < size - lag; i++) {
                correlation += buffer[i] * buffer[i + lag];
                normA += buffer[i] * buffer[i];
                normB += buffer[i + lag] * buffer[i + lag];
            }
            const norm = Math.sqrt(normA * normB) || 1e-6;
            const normalizedCorr = correlation / norm;

            if (normalizedCorr > bestCorrelation) {
                bestCorrelation = normalizedCorr;
                bestLag = lag;
            }
        }

        // Confidence threshold for voiced pitch
        if (bestCorrelation < 0.60 || bestLag <= 0) {
            return { hz: 0, midi: null, confidence: bestCorrelation, rms, voiced: false };
        }

        // Parabolic interpolation for sub-sample accuracy
        let refinedLag = bestLag;
        if (bestLag > 1 && bestLag < maxLag - 1) {
            const y1 = this.correlateLag(buffer, bestLag - 1);
            const y2 = this.correlateLag(buffer, bestLag);
            const y3 = this.correlateLag(buffer, bestLag + 1);
            const denom = 2 * (2 * y2 - y1 - y3);
            if (Math.abs(denom) > 1e-6) {
                const delta = (y1 - y3) / denom;
                refinedLag = bestLag + delta;
            }
        }

        const frequency = this.sampleRate / refinedLag;
        if (frequency < this.minFreq || frequency > this.maxFreq) {
            return { hz: 0, midi: null, confidence: 0, rms, voiced: false };
        }

        const midi = 69.0 + 12.0 * Math.log2(frequency / 440.0);
        return {
            hz: Math.round(frequency * 10) / 10,
            midi: Math.round(midi * 100) / 100,
            confidence: Math.min(1.0, Math.round(bestCorrelation * 100) / 100),
            rms: Math.round(rms * 1000) / 1000,
            voiced: true
        };
    }

    correlateLag(buffer, lag) {
        let sum = 0;
        for (let i = 0; i < buffer.length - lag; i++) {
            sum += buffer[i] * buffer[i + lag];
        }
        return sum;
    }
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function midiToNote(midi) {
    if (midi === null || midi === undefined) return "--";
    const rounded = Math.round(midi);
    const noteIdx = (rounded % 12 + 12) % 12;
    const octave = Math.floor(rounded / 12) - 1;
    return `${NOTE_NAMES[noteIdx]}${octave}`;
}

// Player Game Client
class KaraokePlayerClient {
    constructor() {
        this.socket = null;
        this.audioContext = null;
        this.analyser = null;
        this.detector = null;
        this.mediaStream = null;
        this.isPlaying = false;
        this.gameStarted = false;
        this.gameStartServerEpoch = null;
        this.streamInterval = null;
        this.clockOffset = 0; // serverEpoch - clientEpoch

        // UI elements
        this.joinCard = document.getElementById("join-card");
        this.gameCard = document.getElementById("game-card");
        this.nameInput = document.getElementById("player-name-input");
        this.roomInput = document.getElementById("room-id-input");
        this.joinBtn = document.getElementById("join-btn");
        this.micLevelBar = document.getElementById("mic-level-bar");
        this.statusBadge = document.getElementById("status-badge");
        this.noteDisplay = document.getElementById("current-note");
        this.hzDisplay = document.getElementById("current-hz");
        this.scoreDisplay = document.getElementById("player-score");
        this.streakDisplay = document.getElementById("player-streak");
        this.feedbackPopup = document.getElementById("feedback-popup");

        this.initEventListeners();
    }

    initEventListeners() {
        // Auto-fill roomId from URL query param if present
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoom = urlParams.get("room");
        if (urlRoom) {
            this.roomInput.value = urlRoom;
        }

        this.joinBtn.addEventListener("click", () => this.handleJoin());
    }

    async handleJoin() {
        const name = this.nameInput.value.trim();
        const roomId = this.roomInput.value.trim().toUpperCase();

        if (!name || !roomId) {
            alert("Please enter both your name and Room ID!");
            return;
        }

        this.joinBtn.disabled = true;
        this.joinBtn.innerText = "Connecting Mic...";

        try {
            await this.initMicrophone();
            this.connectWebSocket(roomId, name);
        } catch (err) {
            alert(`Microphone access error: ${err.message}. Make sure you are using HTTPS (or localhost)!`);
            this.joinBtn.disabled = false;
            this.joinBtn.innerText = "Join Stage";
        }
    }

    async initMicrophone() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContextClass();
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false,
            }
        });

        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        source.connect(this.analyser);

        this.detector = new PitchDetector(this.audioContext.sampleRate);
    }

    connectWebSocket(roomId, name) {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws/player/${roomId}/${encodeURIComponent(name)}`;
        
        this.statusBadge.innerText = "Connecting to Host...";
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            this.joinCard.classList.add("hidden");
            this.gameCard.classList.remove("hidden");
            this.statusBadge.innerText = "Connected! Waiting for host to start...";
            this.statusBadge.className = "badge badge-success";
            this.startPitchStreaming();
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };

        this.socket.onclose = () => {
            this.statusBadge.innerText = "Disconnected from room.";
            this.statusBadge.className = "badge badge-danger";
            this.stopPitchStreaming();
        };

        this.socket.onerror = (err) => {
            console.error("WebSocket error:", err);
            this.statusBadge.innerText = "Connection error.";
        };
    }

    handleServerMessage(data) {
        switch (data.type) {
            case "room_joined":
                console.log("Joined room:", data);
                break;

            case "game_started":
                this.gameStarted = true;
                this.gameStartServerEpoch = data.server_start_epoch;
                this.clockOffset = (data.server_now || (Date.now() / 1000)) - (Date.now() / 1000);
                this.statusBadge.innerText = `Singing: ${data.song_title || "Song"}`;
                this.statusBadge.className = "badge badge-singing";
                break;

            case "player_score_feedback":
                this.updateScoreFeedback(data);
                break;

            case "game_stopped":
                this.gameStarted = false;
                this.statusBadge.innerText = "Song finished! Waiting in lobby...";
                this.statusBadge.className = "badge badge-success";
                break;
        }
    }

    updateScoreFeedback(data) {
        this.scoreDisplay.innerText = data.score.toLocaleString();
        this.streakDisplay.innerText = `${data.streak}x`;

        if (data.rating && data.rating !== "SILENT" && data.rating !== "IDLE") {
            this.feedbackPopup.innerText = `${data.rating} ${data.awarded_points ? `+${data.awarded_points}` : ''}`;
            this.feedbackPopup.className = `feedback-tag rating-${data.rating.toLowerCase()}`;
            this.feedbackPopup.style.opacity = "1";
            setTimeout(() => {
                this.feedbackPopup.style.opacity = "0.7";
            }, 500);
        }
    }

    startPitchStreaming() {
        const buffer = new Float32Array(this.analyser.fftSize);

        // Run detection and streaming loop at ~20 FPS (every 50ms)
        this.streamInterval = setInterval(() => {
            if (!this.analyser || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;

            this.analyser.getFloatTimeDomainData(buffer);
            const pitchInfo = this.detector.detect(buffer);

            // Update UI volume meter
            const rmsPercent = Math.min(100, Math.round(pitchInfo.rms * 500));
            this.micLevelBar.style.width = `${rmsPercent}%`;

            // Update UI Note
            if (pitchInfo.voiced) {
                this.noteDisplay.innerText = midiToNote(pitchInfo.midi);
                this.hzDisplay.innerText = `${pitchInfo.hz} Hz`;
                this.noteDisplay.classList.add("active-note");
            } else {
                this.noteDisplay.innerText = "--";
                this.hzDisplay.innerText = "Listening...";
                this.noteDisplay.classList.remove("active-note");
            }

            // Estimate current song playback timestamp if game is active
            let currentSongTime = 0.0;
            if (this.gameStarted && this.gameStartServerEpoch) {
                const currentServerTime = (Date.now() / 1000) + this.clockOffset;
                currentSongTime = Math.max(0.0, currentServerTime - this.gameStartServerEpoch);
            }

            // Stream frame to server
            const payload = {
                type: "pitch_frame",
                t: Math.round(currentSongTime * 100) / 100,
                hz: pitchInfo.hz,
                midi: pitchInfo.midi,
                confidence: pitchInfo.confidence,
                rms: pitchInfo.rms,
            };

            this.socket.send(JSON.stringify(payload));
        }, 50);
    }

    stopPitchStreaming() {
        if (this.streamInterval) {
            clearInterval(this.streamInterval);
            this.streamInterval = null;
        }
    }
}

window.addEventListener("DOMContentLoaded", () => {
    new KaraokePlayerClient();
});
