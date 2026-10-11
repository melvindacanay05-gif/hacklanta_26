import http.server
import socketserver
import os
import sys
import socket
import json
import re
import subprocess
import threading
import time
import webbrowser

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

PUBLIC_TUNNEL_URL = None
tunnel_process = None

def get_lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

LAN_IP = get_lan_ip()

def kill_existing_ssh():
    if sys.platform == "win32":
        try:
            subprocess.run(["taskkill", "/F", "/IM", "ssh.exe"], capture_output=True)
        except Exception:
            pass

def run_tunnel():
    """Runs a dedicated SSH reverse tunnel via localhost.run without loop collisions."""
    global PUBLIC_TUNNEL_URL, tunnel_process
    kill_existing_ssh()
    cmd = [
        "ssh",
        "-T",
        "-n",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ServerAliveInterval=15",
        "-R", f"80:127.0.0.1:{PORT}",
        "nokey@localhost.run"
    ]
    try:
        tunnel_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        print("[TUNNEL] Negotiating public HTTPS tunnel via localhost.run...", flush=True)
        for line in iter(tunnel_process.stdout.readline, ""):
            if not line:
                break
            m = re.search(r"https://[a-zA-Z0-9-]+\.lhr\.life", line)
            if m:
                PUBLIC_TUNNEL_URL = m.group(0)
                print("\n" + "=" * 62, flush=True)
                print(f"[TUNNEL READY] Public HTTPS URL: {PUBLIC_TUNNEL_URL}", flush=True)
                print(f"Mobile phones can scan QR and connect on LTE / Wi-Fi!", flush=True)
                print("=" * 62 + "\n", flush=True)
                break
        tunnel_process.wait()
    except Exception as e:
        print(f"[TUNNEL ERROR] {e}", flush=True)

class PitchBattleHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        # API endpoint returning connection info
        if self.path == "/api/network-info" or self.path == "/network-info":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            data = {
                "lan_ip": LAN_IP,
                "port": PORT,
                "lan_url": f"http://{LAN_IP}:{PORT}",
                "public_url": PUBLIC_TUNNEL_URL
            }
            self.wfile.write(json.dumps(data).encode("utf-8"))
            return

        super().do_GET()

if __name__ == "__main__":
    kill_existing_ssh()
    print("=" * 62)
    print("  PITCH BATTLE - STANDALONE SERVER")
    print(f"  Local URL:   http://localhost:{PORT}")
    print(f"  Wi-Fi IP:    http://{LAN_IP}:{PORT}")
    print("=" * 62)

    # Start single tunnel thread
    t = threading.Thread(target=run_tunnel, daemon=True)
    t.start()

    # Reuse socket to prevent WinError 10048
    socketserver.TCPServer.allow_reuse_address = True

    try:
        with socketserver.TCPServer(("", PORT), PitchBattleHandler) as httpd:
            print(f"Serving HTTP on port {PORT}...")
            time.sleep(1)
            webbrowser.open(f"http://localhost:{PORT}")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        kill_existing_ssh()
    except Exception as e:
        print(f"Server error: {e}")
        kill_existing_ssh()
