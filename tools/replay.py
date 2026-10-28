"""Replay recorded flights through pill.js and check what the pill shows.

    python tools/replay.py                       the latest pill log: where the pill now differs from the flight
    python tools/replay.py LOG [LOG ...]         those logs (names in the logs folder, or paths)
    python tools/replay.py --save base.json LOG  keep this run's views
    python tools/replay.py --against base.json   compare with a kept run instead of the flight (after a refactor:
                                                 nothing should differ)
    --config '{"facility": "full"}'              settings to start from (the log only has the changes made in flight)

Each pill log (tools/pill_log.py) holds every BeyondATC message and what the pill showed. The replay feeds those
messages to the real src pill.js in headless Edge (or Chrome), on a virtual clock, and collects what it shows.
Clicks and PTT aren't replayed, so after one the flight and the replay can part for a while. Needs Edge/Chrome.
"""
import argparse
import html
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "html_ui" / "paulcharp-batc-overlay"
sys.path.insert(0, str(ROOT / "docs"))
sys.path.insert(0, str(ROOT / "tools"))
from render_images import edge  # noqa: E402
from pill_log import log_dir  # noqa: E402

PAGE = """<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="{css}">
<body>
<ui-resource-element name="MasterPage_InGame"></ui-resource-element>
<script src="data.js"></script>
<script>
  // a virtual clock: timers run in order as the replay advances, so a 3-hour flight takes seconds
  var vnow = 1e12, queue = [], seq = 0, views = [];
  Date.now = function () {{ return vnow; }};
  window.setTimeout = function (fn, ms) {{ var id = ++seq; queue.push({{ id: id, at: vnow + (ms || 0), fn: fn }}); return id; }};
  window.clearTimeout = function (id) {{ queue = queue.filter(function (q) {{ return q.id !== id; }}); }};
  window.setInterval = function () {{ return 0; }};
  window.clearInterval = function () {{}};
  window.requestAnimationFrame = function (fn) {{ return window.setTimeout(fn, 16); }};
  function advance(to) {{
    for (;;) {{
      queue.sort(function (a, b) {{ return a.at - b.at || a.id - b.id; }});
      if (!queue.length || queue[0].at > to) break;
      var q = queue.shift();
      vnow = Math.max(vnow, q.at);
      q.fn();
    }}
    vnow = Math.max(vnow, to);
  }}
  window.batcOverlayInlineCss = " ";
  // BeyondATC's socket is fed by hand; the dev log socket (devLog on) reports every view the pill shows
  window.WebSocket = function (url) {{
    this.url = url; this.readyState = 1;
    var self = this;
    window.setTimeout(function () {{ self.onopen && self.onopen(); }}, 0);
  }};
  window.WebSocket.prototype.send = function (d) {{
    if (!/41799/.test(this.url)) return;
    var r = JSON.parse(d);
    if (r.k === "pill") views.push([(vnow - 1e12) / 1000, r.v]);
  }};
  window.WebSocket.prototype.close = function () {{}};
</script>
<script src="pill.js"></script>
<pre id="out"></pre>
<script>
  var out = document.getElementById("out");
  try {{
    advance(1e12 + 100);
    batcOverlay.state.inFlight = true;
    batcOverlay.set(START);
    // BeyondATC's messages, and the settings changes made in flight
    MSGS.forEach(function (m) {{
      advance(1e12 + m[0] * 1000);
      if (typeof m[1] === "string") batcOverlay.feed(m[1]); else batcOverlay.set(m[1]);
    }});
    advance(vnow + 30000);
    out.textContent = JSON.stringify(views);
  }} catch (e) {{ out.textContent = "ERROR " + e.stack; }}
</script>
"""


def find_log(name):
    p = Path(name)
    if p.exists():
        return p
    p = log_dir() / name
    if p.exists():
        return p
    sys.exit(f"replay: no log {name}")


def records(log):
    out = []
    for line in log.read_text(encoding="utf-8").splitlines():
        try:
            r = json.loads(line)
        except ValueError:
            continue
        if "t" in r:
            out.append(r)
    return out


def replay(log, start):
    """[[t, view], ...] the pill shows when log's BeyondATC messages (and settings changes) are fed to src pill.js,
    starting from the default settings patched with start."""
    js = (SRC / "pill.js").read_text(encoding="utf-8")
    if "    devLog: false," not in js:
        sys.exit("replay: can't find `devLog: false,` in pill.js")
    msgs = []
    for r in records(log):
        if "msg" in r:
            msgs.append([r["t"], r["msg"]])
        elif r.get("event", "").startswith("settings {"):
            msgs.append([r["t"], json.loads(r["event"][len("settings "):])])
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / "pill.js").write_text(js.replace("    devLog: false,", "    devLog: true,", 1), encoding="utf-8")
        (tmp / "data.js").write_text("var MSGS = " + json.dumps(msgs) + "; var START = " + json.dumps(start) + ";",
                                     encoding="utf-8")
        (tmp / "replay.html").write_text(PAGE.format(css=(SRC / "pill.css").as_uri()), encoding="utf-8")
        dom = subprocess.run([edge(), "--headless=new", "--disable-gpu", "--allow-file-access-from-files",
                              f"--user-data-dir={tmp / 'profile'}", "--dump-dom", (tmp / "replay.html").as_uri()],
                             capture_output=True, text=True, encoding="utf-8", timeout=600).stdout
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
    if not m:
        sys.exit(f"replay: {log.name}: no output from the browser")
    text = html.unescape(m.group(1))
    if text.startswith("ERROR"):
        sys.exit(f"replay: {log.name}: {text}")
    return [[round(t, 3), v] for t, v in json.loads(text)]


def changes(views):
    """Only the moments the view changes (the dev log repeats a view on reconnect)."""
    out, last = [], None
    for t, v in views:
        if v != last:
            out.append([t, v])
            last = v
    return out


def diff(old, new, label_old, label_new, limit):
    """Print where two view sequences part (compared in order, ignoring timing); returns the count."""
    a, b = [v for _, v in old], [v for _, v in new]
    import difflib
    n = 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            continue
        n += 1
        if n <= limit:
            t = new[j1][0] if j1 < len(new) else old[i1][0]
            print(f"  {t:9.1f}s  {label_old}: {' / '.join(a[i1:i2]) or '-'}")
            print(f"  {'':10} {label_new}: {' / '.join(b[j1:j2]) or '-'}")
    if n > limit:
        print(f"  ... {n - limit} more")
    return n


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("logs", nargs="*", help="pill-*.jsonl names or paths (default: the latest)")
    ap.add_argument("--save", type=Path, help="write this run's views, by log name, to a JSON file")
    ap.add_argument("--against", type=Path, help="compare with a file written by --save")
    ap.add_argument("--config", default="{}", help='settings to start from, as JSON: {"facility": "full"}')
    ap.add_argument("--limit", type=int, default=20, help="differences printed per log")
    args = ap.parse_args()
    start = json.loads(args.config)
    sys.stdout.reconfigure(encoding="utf-8")

    base = json.loads(args.against.read_text(encoding="utf-8")) if args.against else None
    logs = [find_log(n) for n in args.logs]
    if not logs and base:
        logs = [find_log(n) for n in base]
    if not logs:
        found = sorted(log_dir().glob("pill-*.jsonl"))
        if not found:
            sys.exit(f"replay: no pill logs in {log_dir()}")
        logs = [found[-1]]

    saved, total = {}, 0
    for log in logs:
        views = changes(replay(log, start))
        saved[log.name] = views
        if base is not None:
            if log.name not in base:
                print(f"{log.name}: not in {args.against.name}")
                continue
            print(f"{log.name}: {len(views)} views")
            total += diff(base[log.name], views, "before", "now", args.limit)
        else:
            flown = changes([[r["t"], r["pill"]] for r in records(log) if "pill" in r])
            print(f"{log.name}: {len(views)} views, {len(flown)} in flight")
            total += diff(flown, views, "flight", "now", args.limit)
    if args.save:
        args.save.write_text(json.dumps(saved), encoding="utf-8")
        print(f"replay: saved {args.save}")
    if base is not None:
        print("replay: same as before" if total == 0 else f"replay: {total} differences")
        sys.exit(1 if total else 0)


if __name__ == "__main__":
    main()
