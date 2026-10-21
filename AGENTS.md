# Agent notes

MSFS 2024 community package (`paul-batc-pill`) that shows BeyondATC's comms state as a small pill in a
screen corner during flight, with a click-to-open settings card. Windows only. User docs:
[README.md](README.md).

## Layout

- `src/html_ui/paul-batc-pill/pill.js`: the whole runtime. Read-only WebSocket client for BeyondATC
  (`ws://127.0.0.1:41716`), state machine (`view()`), animated render (`render()` measures the new
  content, then transitions width), settings card, `CONFIG` defaults. `pill.css`: the look; `--u` is
  one 1080p pixel times `CONFIG.scale`.
- `injections.json` + `tools/build.py`: the build copies the stock `MasterPage_InGame` cooked component
  from the local sim install, appends a hidden `<img onerror>` that loads `pill.js` once, and writes
  `layout.json` / `manifest.json`. `build | install | uninstall | lock | release [X.Y.Z]`.
  `stock.lock.json` holds the stock hash so `build` warns after sim updates.
- `config.json`: package metadata. Local paths (`sim_packages`, `community`) go in
  `.local/config.json`, which overrides it.
- `tools/inspect_ui.py`: Coherent inspector client (Devmode, `localhost:19999`); `--list`, `--page N`,
  `--push` hot-reloads the pill into mainUi (page 2). `tools/sniff_batc.py`: socket logger.
  `tools/harness.html`: desktop preview with replays.
- `docs/render/*.html` + `docs/render_images.py`: README/flightsim.to images via headless Edge.
  `docs/flightsim-to.md`: flightsim.to page text. `CHANGELOG.md`: release history.
- `.github/workflows/check.yml`: syntax checks only (CI can't build without a sim install).
- `.local/` (git-ignored): local config, mockups, screenshots. Put new private files there.

## Sim facts (verified live)

- In-flight fullscreen UI is the `mainUi` view. `MasterPage_InGame` mounts there only in flight.
  `Toolbar_Trigger` renders in the toolbar's own small Panel.html view instead: don't hook it.
- Clicks reach an element only if the element directly under the cursor has `data-input-group` and
  computed `pointer-events` isn't `none` (mainUi inherits `none`). Mousemove arrives regardless.
- `localStorage` is shared across all Coherent views; persistence across sim restarts is unverified.
- mainUi has no `SimVar`, `GetStoredData` or `Coherent`; VCockpit views (e.g. VLogic) have `SimVar`.
- mainUi fonts: only `Roboto-Regular` / `RobotoMono-Regular`; weights are synthesized.
- Avoid `gap`, `color-mix`, `backdrop-filter` in pill.css (Gameface).

## BeyondATC protocol

- Snapshot pushed on connect; several clients are fine. `CommsState: {"mode","text"}` modes seen:
  `ready`, `queued`, `processing`, `request`, `awaiting`, `speaking` (binary also has `waiting`,
  `controller`, `loading`, `download`, `turnaround`, `menu`).
- `speaking` is used for ATC and for the pilot TTS; the preceding `ATC:`/`ATCTraffic:`, `Player:` or
  `Traffic:` line says who.
- `Facility: Name (runways)|freq` or `Nothing Tuned`; `Com2: {label,frequency,monitor}`;
  `LoadState: {stage}` (`menu` in menus); `RadioMute: {com1,com2}`; `AppError: text`.
- No known "readback expected" signal. `pill.js` turns the `ATC:` text into short hints (`READBACKS`) and clears
  on the next `Player:` line, `processing`/`request`/`queued`, a COM1 change or `readbackMs`. Unverified
  live: what a voice (PTT) readback sends, and whether `waiting` means "awaiting readback".
- Nothing is sent while PTT is held, and no simvar shows it: PTT state is out of scope without a
  desktop helper.

## Rules

- Never commit Asobo files (cooked components, vanilla UI); the build copies them from the local install.
- Never send anything on the BeyondATC socket.
- Changelogs and release notes list what changed, not why.
