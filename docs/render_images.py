"""Render the README and flightsim.to images from docs/render/*.html with headless Edge. Needs Pillow.

    python docs/render_images.py

Writes docs/images/states.png, settings.png and splash.png. If .local/shots/splash-bg.png exists
(a 16:9 sim screenshot), the splash uses it as its backdrop.
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
    found = shutil.which("msedge")
    if not found:
        sys.exit("render: Microsoft Edge not found")
    return found


def shoot(page, size, scale, query=""):
    """Screenshot page at size (CSS px) and device scale; returns a PIL image."""
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "shot.png"
        url = (RENDER / page).as_uri() + query
        subprocess.run([
            edge(), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
            f"--user-data-dir={Path(tmp) / 'profile'}",  # fresh profile: no saved pill settings
            f"--window-size={size[0]},{size[1]}", f"--force-device-scale-factor={scale}",
            "--virtual-time-budget=4000", f"--screenshot={png}", url,
        ], check=True, capture_output=True)
        return Image.open(png).copy()


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    img = shoot("states.html", (1200, 456), 2)
    img.save(OUT / "states.png", optimize=True)
    print(f"render: states.png {img.size}")

    # pill + open card in the top-right corner of a 1080p screen
    img = shoot("settings.html", (1920, 1080), 2).crop((1580 * 2, 50 * 2, 1920 * 2, 520 * 2))
    img.save(OUT / "settings.png", optimize=True)
    print(f"render: settings.png {img.size}")

    bg = ROOT / ".local" / "shots" / "splash-bg.png"
    query = "?bg=" + bg.as_uri() if bg.exists() else ""
    img = shoot("splash.html", (1920, 1080), 1, query)
    img.save(OUT / "splash.png", optimize=True)
    print(f"render: splash.png {img.size}{' (sim backdrop)' if query else ''}")


if __name__ == "__main__":
    main()
