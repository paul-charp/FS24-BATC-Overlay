"""Record a flight as the pill sees it. Stdlib only.

    python tools/pill_log.py                   listen on 127.0.0.1:41799 until Ctrl+C, write logs/pill-<date>.jsonl
    python tools/pill_log.py --quiet           print only what the pill shows and does, not BeyondATC's messages

Turn on "Log flight (developers)" in the pill's settings. The pill then streams here everything it gets
from BeyondATC (it reconnects once so the log starts with BeyondATC's snapshot), what it shows, and what you
do (clicks, PTT, settings, the Auto Tune / Auto Respond commands). Records:

    {"t": 12.345, "msg": "CommsState: {...}"}       as sniff_batc.py writes them (replays and batc_timeline.py read them)
    {"t": 12.351, "pill": "s-atc is-pulse | Awaiting readback · Taxi 30R"}
    {"t": 14.002, "event": "ptt down"}

Each line is written as it arrives, so a sim crash keeps everything up to it.
"""
import argparse
import base64
import hashlib
import json
import re
import socket
import struct
import time
from pathlib import Path

PORT = 41799
NOISY = ("DATIS", "Settings", "Actions", "InfoBoxes", "Progress", "Traffic:", "ATCTraffic:")


def recv_exact(conn, n):
    data = b""
    while len(data) < n:
        chunk = conn.recv(n - len(data))
        if not chunk:
            raise ConnectionError("closed")
        data += chunk
    return data


def handshake(conn):
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = conn.recv(4096)
        if not chunk:
            raise ConnectionError("closed during handshake")
        data += chunk
    key = re.search(rb"Sec-WebSocket-Key:\s*(\S+)", data, re.I)
    if not key:
        raise ConnectionError("not a WebSocket request")
    accept = base64.b64encode(hashlib.sha1(key.group(1) + b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest())
    conn.sendall(b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                 b"Sec-WebSocket-Accept: " + accept + b"\r\n\r\n")


def messages(conn):
    """Yield the text messages a WebSocket client sends (clients mask their frames)."""
    parts = b""
    while True:
        b0, b1 = recv_exact(conn, 2)
        fin, opcode, n = b0 & 0x80, b0 & 0x0F, b1 & 0x7F
        if n == 126:
            n = struct.unpack(">H", recv_exact(conn, 2))[0]
        elif n == 127:
            n = struct.unpack(">Q", recv_exact(conn, 8))[0]
        mask = recv_exact(conn, 4) if b1 & 0x80 else b"\0\0\0\0"
        payload = bytes(c ^ mask[i % 4] for i, c in enumerate(recv_exact(conn, n)))
        if opcode == 8:  # close
            conn.sendall(b"\x88\x00")
            return
        if opcode == 9:  # ping
            conn.sendall(bytes([0x8A, len(payload)]) + payload)
            continue
        if opcode in (0, 1):
            parts += payload
            if fin:
                yield parts.decode("utf-8", "replace")
                parts = b""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quiet", action="store_true", help="don't print BeyondATC's messages on the console")
    args = ap.parse_args()

    logs = Path(__file__).resolve().parent.parent / "logs"
    logs.mkdir(exist_ok=True)
    out = logs / f"pill-{time.strftime('%Y%m%d-%H%M%S')}.jsonl"
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("127.0.0.1", PORT))
    server.listen(1)
    t0 = time.monotonic()
    print(f"pill_log: waiting for the pill on 127.0.0.1:{PORT} (turn on \"Log flight\" in its settings)")
    print(f"pill_log: logging to {out}")
    with out.open("w", encoding="utf-8") as f:
        def write(rec):
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            f.flush()

        try:
            while True:
                conn, _ = server.accept()
                try:
                    handshake(conn)
                    write({"t": round(time.monotonic() - t0, 3), "event": "pill connected"})
                    print(f"{time.monotonic() - t0:8.2f}  -- pill connected")
                    for text in messages(conn):
                        t = round(time.monotonic() - t0, 3)
                        try:
                            rec = json.loads(text)
                        except ValueError:
                            continue
                        kind, value = rec.get("k"), rec.get("v", "")
                        if kind not in ("msg", "pill", "event"):
                            continue
                        write({"t": t, kind: value})
                        if kind == "msg":
                            if not (args.quiet or value.startswith(NOISY) or '"traffic"' in value):
                                print(f"{t:8.2f}  {value[:150]}")
                        else:
                            print(f"{t:8.2f}  {'PILL ' if kind == 'pill' else '-- '}{value[:150]}")
                except (ConnectionError, OSError) as e:
                    print(f"{time.monotonic() - t0:8.2f}  -- pill disconnected ({e})")
                finally:
                    conn.close()
                write({"t": round(time.monotonic() - t0, 3), "event": "pill disconnected"})
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
