"""Render the README and flightsim.to images from docs/render/*.html with headless Edge (or Chrome/Chromium).
Needs Pillow.

    python docs/render_images.py

Writes docs/images/splash.png (the title over a clearance and its answer), detail.png (the same clearance at four
levels of detail), assist.png (the warnings and reminders) and toolbar.png (requests, Frequencies, Log), each
1920x1080, on the radar-screen backdrop of docs/render/backdrop.js. If .local/shots/<name>-bg.png exists (a 16:9
sim screenshot), that image uses it instead.
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RENDER = ROOT / "docs" / "render"
OUT = ROOT / "docs" / "images"
EDGE = [
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]


def edge():
    for p in EDGE:
        if p.exists():
            return str(p)
    for name in ("msedge", "chrome", "google-chrome", "chromium", "chromium-browser"):
        found = shutil.which(name)
        if found:
            return found
    sys.exit("render: no Edge, Chrome or Chromium found")


def shoot(page, size, scale, query=""):
    """Screenshot page at size (CSS px) and device scale; returns a PIL image.

    The window is made taller than needed, then cropped: headless Chromium keeps part of the window
    height for itself, so a window of exactly `size` cuts the bottom off."""
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "shot.png"
        url = (RENDER / page).as_uri() + query
        subprocess.run([
            edge(), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
            *(["--no-sandbox"] if sys.platform != "win32" else []),  # containers run as root
            f"--user-data-dir={Path(tmp) / 'profile'}",  # fresh profile: no saved pill settings
            f"--window-size={size[0]},{size[1] + 200}", f"--force-device-scale-factor={scale}",
            "--virtual-time-budget=8000", f"--screenshot={png}", url,
        ], check=True, capture_output=True)
        return Image.open(png).crop((0, 0, size[0] * scale, size[1] * scale))


def amber(img):
    """Pixels of the amber answer chip's fill (a few thousand at half size when it shows, under 1500 without)."""
    small = img.convert("RGB").resize((img.width // 2, img.height // 2))
    px = small.tobytes()
    return sum(1 for r, g, b in zip(px[0::3], px[1::3], px[2::3]) if r > 235 and 156 < g < 206 and 36 < b < 106)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # 1920x1080 cards, for the README and flightsim.to's gallery; .local/shots/<name>-bg.png (a 16:9 sim screenshot)
    # replaces the drawn backdrop. The hovered pill in splash and detail sometimes misses its answer chip in headless
    # Edge (the hover lands before the menu): those are shot again until the chip shows.
    for name in ("splash", "detail", "assist", "toolbar"):
        bg = ROOT / ".local" / "shots" / f"{name}-bg.png"
        query = "?bg=" + bg.as_uri() if bg.exists() else ""
        for attempt in range(6):
            img = shoot(f"{name}.html", (1920, 1080), 1, query)
            if name not in ("splash", "detail") or amber(img) > 1800:
                break
            print(f"render: {name}.png missed the answer chip, again")
        img.save(OUT / f"{name}.png", optimize=True)
        print(f"render: {name}.png {img.size}{' (sim backdrop)' if bg.exists() else ''}")


if __name__ == "__main__":
    main()
