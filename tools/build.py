"""Build tool for the paul-batc-pill community package.

    python tools/build.py build       assemble build/<package>/ with the hooked component, layout.json, manifest.json
    python tools/build.py install     build, then junction build/<package> into the Community folder
    python tools/build.py uninstall   remove the Community junction
    python tools/build.py lock        record the stock hash of each hooked component in stock.lock.json
    python tools/build.py release [X.Y.Z]   build, then zip the package as dist/paul-batc-pill-X.Y.Z.zip
    python tools/build.py logger-install    have the sim start tools/pill_log.py (pythonw, no console) via exe.xml
    python tools/build.py logger-uninstall  remove it from exe.xml

Local paths (sim_packages, community) go in .local/config.json, which overrides config.json; so does
exe_xml, when the sim's exe.xml isn't found on its own.
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BUILD = ROOT / "build"
DIST = ROOT / "dist"
LOCK = ROOT / "stock.lock.json"
MARK_BEGIN = "<!-- paul-batc-pill:begin -->"
MARK_END = "<!-- paul-batc-pill:end -->"
# Seconds between 1601-01-01 (Windows FILETIME epoch) and 1970-01-01.
FILETIME_EPOCH = 11644473600


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def load_config(required=("sim_packages", "community")):
    cfg = load_json(ROOT / "config.json")
    local = ROOT / ".local" / "config.json"
    if local.exists():
        cfg.update(load_json(local))
    for key in required:
        if not cfg.get(key):
            sys.exit(f"config: set {key} in .local/config.json (see config.json)")
    return cfg


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def target(inj):
    """Package-relative path of the stock cooked component we override."""
    return f"cookedcomps/{{{inj['guid']}}}.html"


def stock_file(cfg, inj):
    return Path(cfg["sim_packages"]) / inj["package"] / target(inj)


def inject(html, inj):
    """Append a hidden <img onerror> hook inside the component's root element.

    Cooked components are inserted as HTML strings, so <script> tags never run; an onerror
    handler does. It loads our boot script once per view. Same pattern as //42 Flow and FS24-UI.
    """
    if MARK_BEGIN in html:
        raise ValueError("stock file already contains our markers")
    root_end = html.rfind("</ui-resource-element>")
    if root_end < 0:
        raise ValueError("no root </ui-resource-element> in cooked component")
    hook = (
        f'{MARK_BEGIN}<svg x="0px" y="0px" width="0px" height="0px" viewBox="0 0 1 1"><foreignObject>'
        f'<img src onerror="(() => {{ if (!window.{inj["guard"]}) {{ window.{inj["guard"]} = true; '
        f"var s = document.createElement('script'); s.type = 'text/javascript'; s.src = '{inj['boot']}'; "
        f'document.head.appendChild(s); }} }})()"></img>'
        f"</foreignObject></svg>{MARK_END}"
    )
    return html[:root_end] + hook + html[root_end:]


def filetime(path):
    return int((path.stat().st_mtime + FILETIME_EPOCH) * 10_000_000)


def cmd_lock(cfg, injections):
    lock = {target(inj): sha256(stock_file(cfg, inj)) for inj in injections}
    write_json(LOCK, lock)
    print(f"lock: wrote {LOCK.name} ({len(lock)} targets)")


def sync_tree(src, dst):
    """Copy src over dst in place and return the files written. The folder itself is kept: with the
    sim running, the Community junction holds it open and Windows refuses to delete it (WinError 32)."""
    written = set()
    for f in sorted(src.rglob("*")):
        out = dst / f.relative_to(src)
        if f.is_dir():
            out.mkdir(parents=True, exist_ok=True)
        else:
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, out)
            written.add(out)
    return written


def prune(pkg_dir, written):
    """Remove files and empty folders a previous build left that this one didn't write."""
    for f in sorted(pkg_dir.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        try:
            if f.is_file() and f not in written:
                f.unlink()
                print(f"build: removed stale {f.relative_to(pkg_dir).as_posix()}")
            elif f.is_dir() and not any(f.iterdir()):
                f.rmdir()
        except OSError as e:
            print(f"build: WARNING could not remove {f.relative_to(pkg_dir).as_posix()} ({e.strerror})")


def cmd_build(cfg, injections):
    pkg_dir = BUILD / cfg["package_name"]
    pkg_dir.mkdir(parents=True, exist_ok=True)
    written = sync_tree(SRC, pkg_dir)

    lock = load_json(LOCK) if LOCK.exists() else {}
    stale = []
    for inj in injections:
        stock = stock_file(cfg, inj)
        if not stock.exists():
            sys.exit(f"build: stock file missing (sim update moved it?): {stock}")
        if lock.get(target(inj)) != sha256(stock):
            stale.append(target(inj))
        out = pkg_dir / target(inj)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(inject(stock.read_text(encoding="utf-8-sig"), inj), encoding="utf-8")
        # The cooked .json (animations, exposed children) ships alongside the .html.
        shutil.copy2(stock.with_suffix(".json"), out.with_suffix(".json"))
        written.update({out, out.with_suffix(".json")})
        print(f"build: hooked {inj['component']} -> {target(inj)}")

    written.update({pkg_dir / "layout.json", pkg_dir / "manifest.json"})
    prune(pkg_dir, written)

    content = []
    for f in sorted(p for p in pkg_dir.rglob("*") if p.is_file() and not (p.parent == pkg_dir and p.name in ("layout.json", "manifest.json"))):
        content.append({
            "path": f.relative_to(pkg_dir).as_posix(),
            "size": f.stat().st_size,
            "date": filetime(f),
        })
    write_json(pkg_dir / "layout.json", {"content": content})

    deps = []
    for name in sorted({inj["package"] for inj in injections}):
        stock_manifest = load_json(Path(cfg["sim_packages"]) / name / "manifest.json")
        deps.append({"name": name, "package_version": stock_manifest["package_version"]})
    write_json(pkg_dir / "manifest.json", {
        "dependencies": deps,
        "content_type": "MISC",
        "title": cfg["title"],
        "manufacturer": "",
        "creator": cfg["creator"],
        "package_version": cfg["version"],
        "minimum_game_version": "1.8.16",
        "builder": "Microsoft Flight Simulator 2024",
        "package_order_hint": "",
        "release_notes": {"neutral": {"LastUpdate": time.strftime("%Y-%m-%d"), "OlderHistory": ""}},
    })
    print(f"build: {len(content)} files -> {pkg_dir}")

    if stale:
        print("build: WARNING stock changed since the last `lock`:")
        for t in stale:
            print(f"  {t}")
        print("  check the component still mounts in flight, then run `python tools/build.py lock`.")


def community_link(cfg):
    return Path(cfg["community"]) / cfg["package_name"]


def cmd_install(cfg, injections):
    cmd_build(cfg, injections)
    link = community_link(cfg)
    target = BUILD / cfg["package_name"]
    if link.exists() or os.path.lexists(link):
        if not link.is_junction():
            sys.exit(f"install: {link} exists and is not our junction; remove it by hand")
        print(f"install: junction already in place: {link}")
        return
    subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(target)], check=True)
    print("install: restart the sim to pick up new files; JS/CSS edits only need a rebuild + UI reload")


def cmd_uninstall(cfg, injections):
    link = community_link(cfg)
    if not os.path.lexists(link):
        print("uninstall: nothing installed")
        return
    if not link.is_junction():
        sys.exit(f"uninstall: {link} is not a junction; refusing to delete it")
    os.rmdir(link)  # removes the junction only, never the build output
    print(f"uninstall: removed {link}")


def cmd_release(cfg, injections, version=None):
    if version:
        cfg["version"] = version.lstrip("v")
    cmd_build(cfg, injections)
    pkg_dir = BUILD / cfg["package_name"]
    DIST.mkdir(exist_ok=True)
    out = DIST / f"{cfg['package_name']}-{cfg['version']}.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(p for p in pkg_dir.rglob("*") if p.is_file()):
            z.write(f, f.relative_to(BUILD).as_posix())
    print(f"release: {out}")


LOGGER_NAME = "BATC Pill logger"


def exe_xml(cfg):
    """The sim's exe.xml (programs it starts with it): .local/config.json's exe_xml, else the Store or Steam
    location, whichever holds the sim's UserCfg.opt."""
    if cfg.get("exe_xml"):
        return Path(cfg["exe_xml"])
    local, roaming = os.environ.get("LOCALAPPDATA", ""), os.environ.get("APPDATA", "")
    for folder in (Path(local) / "Packages" / "Microsoft.Limitless_8wekyb3d8bbwe" / "LocalCache",
                   Path(roaming) / "Microsoft Flight Simulator 2024"):
        if (folder / "UserCfg.opt").exists():
            return folder / "exe.xml"
    sys.exit("logger: can't find the sim's exe.xml; set exe_xml in .local/config.json")


def load_exe_xml(path):
    if path.exists():
        return ET.parse(path)
    root = ET.Element("SimBase.Document", {"Type": "Launch", "version": "1,0"})
    for tag, text in (("Descr", "Launch"), ("Filename", "exe.xml"), ("Disabled", "False"),
                      ("Launch.ManualLoad", "False")):
        ET.SubElement(root, tag).text = text
    return ET.ElementTree(root)


def save_exe_xml(tree, path):
    if path.exists():
        backup = path.with_name(f"exe.xml.bak-{time.strftime('%Y%m%d-%H%M%S')}")
        shutil.copy2(path, backup)
        print(f"logger: backed up {path.name} to {backup.name}")
    ET.indent(tree, space="  ")
    # the header as the sim's own exe.xml has it
    xml = '<?xml version="1.0" encoding="Windows-1252"?>\n' + ET.tostring(tree.getroot(), encoding="unicode") + "\n"
    path.write_bytes(xml.encode("cp1252", "xmlcharrefreplace"))


def ours(tree):
    return [a for a in tree.getroot().findall("Launch.Addon") if (a.findtext("Name") or "") == LOGGER_NAME]


def cmd_logger_install(cfg, injections):
    path = exe_xml(cfg)
    tree = load_exe_xml(path)
    for a in ours(tree):
        tree.getroot().remove(a)
    exe = Path(sys.executable)
    pythonw = exe.with_name("pythonw.exe")  # no console window
    addon = ET.SubElement(tree.getroot(), "Launch.Addon")
    ET.SubElement(addon, "Name").text = LOGGER_NAME
    ET.SubElement(addon, "Disabled").text = "False"
    ET.SubElement(addon, "Path").text = str(pythonw if pythonw.exists() else exe)
    ET.SubElement(addon, "CommandLine").text = f'"{ROOT / "tools" / "pill_log.py"}" --background'
    save_exe_xml(tree, path)
    print(f"logger: the sim now starts tools/pill_log.py in the background ({path})")
    print("logger: restart the sim, then switch on \"Log flight (developers)\" in the pill's settings")


def cmd_logger_uninstall(cfg, injections):
    path = exe_xml(cfg)
    if not path.exists() or not ours(load_exe_xml(path)):
        print("logger: not in exe.xml")
        return
    tree = load_exe_xml(path)
    for a in ours(tree):
        tree.getroot().remove(a)
    save_exe_xml(tree, path)
    print(f"logger: removed from {path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["build", "install", "uninstall", "lock", "release",
                                            "logger-install", "logger-uninstall"])
    parser.add_argument("version", nargs="?", help="release only: package version, default from config.json")
    args = parser.parse_args()
    cfg = load_config(() if args.command.startswith("logger") else ("sim_packages", "community"))
    injections = load_json(ROOT / "injections.json")["injections"]
    try:
        if args.command == "release":
            cmd_release(cfg, injections, args.version)
        else:
            globals()[f"cmd_{args.command.replace('-', '_')}"](cfg, injections)
    except PermissionError as e:
        # the sim keeps some package files open while it runs
        sys.exit(f"{args.command}: {e.filename} is in use ({e.strerror}). Close the sim and run it again; "
                 "for JS/CSS changes while the sim runs, use `python tools/inspect_ui.py --push`.")


if __name__ == "__main__":
    main()
