# 🎤 PitchBattle - Voice Arena & Multiplayer Karaoke

PitchBattle is a zero-latency, WebRTC-powered voice battle arena. Sing solo with your laptop microphone or scan the QR code to connect mobile phones as low-latency wireless microphones with zero server lag!

## Features
- **7 Playable Tracks**: Includes *You Are My Sunshine*, *Twinkle Twinkle Little Star*, *Alphabet Song (ABC)*, *Happy*, *Love Story*, *On & On*, and *Let It Go (Frozen)*.
- **Popcorn 2-Player Singing**: Half-and-half phrase division with 3...2...1 transition countdown banners. Features automatic **off-turn muting** so only the active singer scores points.
- **Concurrent Mog Battle**: Simultaneous real-time voice duel on the hit line.
- **Client-Side YIN Pitch Detection**: 60 FPS real-time pitch tracking with $\pm0.75$ semitone tolerance (octave-folded).
- **Public HTTPS Tunnel**: Automatic `localhost.run` tunnel generation for instant mobile mic streaming from iOS/Android.

## Quick Start
1. Run the server:
   ```bash
   python run_pitchbattle.py
   ```
2. Open `http://localhost:8000` in your browser.
3. Click **"Enable Laptop Mic"** for instant solo play, or scan the on-screen QR code with your phone to join as a player!
