# Agent notes

MSFS 2024 community package BATC Overlay (`paulcharp-batc-overlay`, the repo FS24-BATC-Overlay) that shows BeyondATC's comms state as a small pill in a
screen corner during flight, with a click-to-open settings card. Windows only. User docs:
[README.md](README.md).

## Layout

- `src/html_ui/paulcharp-batc-overlay/pill.js`: the whole runtime. WebSocket client for BeyondATC
  (`ws://127.0.0.1:41716`), state machine (`view()`), animated render (`render()` measures the new
  content, then transitions width), settings card, `CONFIG` defaults, and the comms section (messages under the
  pill, answers/requests on hover, Frequencies/Log panel). `pill.css`: the look; `--u` is
  one 1080p pixel times `CONFIG.scale`.
- `injections.json` + `tools/build.py`: the build copies the stock `MasterPage_InGame` cooked component
  from the local sim install, appends a hidden `<img onerror>` that loads `pill.js` once, and writes
  `layout.json` / `manifest.json`. `build | install | uninstall | lock | release [X.Y.Z]`.
  `stock.lock.json` holds the stock hash so `build` warns after sim updates.
- `config.json`: package metadata. Local paths (`sim_packages`, `community`) go in
  `.local/config.json`, which overrides it.
- `tools/inspect_ui.py`: Coherent inspector client (Devmode, `localhost:19999`); `--list`, `--page N`,
  `--push` hot-reloads the pill into mainUi (page 2). If it times out, a dead sim's child process may hold
  the port (seen: WinWing's SimAppPro2.exe): `netstat -ano | findstr 19999` shows a second LISTENING PID.
  `tools/sniff_batc.py`: socket logger; `tools/pill_log.py`: the pill's own flight log (builds from
  `build.py build`/`install` and `inspect_ui.py --push` set `CONFIG.devLog` and stream BeyondATC's messages,
  what the pill shows and what the user does to `ws://127.0.0.1:41799` while it runs; `release` doesn't;
  sniffer records plus `{"t","pill"}` / `{"t","event"}`; every command the pill sends is an event). Both write
  to `%LOCALAPPDATA%\paulcharp-batc-overlay\logs`. `tools/batc_timeline.py` prints either log as a timeline with
  `Actions`/`InfoBoxes` changes as diffs. `tools/harness.html`: desktop preview with replays, a fake
  `engine` and a "Hold PTT" button; `?fake` swaps in a socket that records what the pill sends (`batcOverlay.sent`).
  `tools/replay.py` feeds pill logs back through src pill.js (headless Edge, virtual clock) and prints where the pill
  now differs from the flight; `--save` / `--against` compare two runs (before and after a refactor: no difference).
  It replays BeyondATC's messages and settings changes, not clicks or PTT; `--config` sets the starting settings.
- `docs/render/*.html` + `docs/render_images.py`: the four 1920x1080 README/flightsim.to images via headless Edge (or
  Chrome/Chromium): `splash` (title + a takeoff clearance and its answer), `detail` (one clearance at four levels of
  detail), `assist` (warnings), `toolbar` (requests, Frequencies, Log). `backdrop.js` draws their radar-screen backdrop
  (`.local/shots/<name>-bg.png` replaces it); `pills.js` mirrors `view()`'s markup for static pills; `comms.html` runs
  the real pill.js on recorded exchanges through a stand-in socket, its query picking settings and moment (`detail`,
  `captions`, `scene`, `hover`, `panel`); the cards embed it zoomed (`?bare`). The hover sometimes misses the answer chip
  in headless Edge: the script reshoots until the chip's amber shows. Headless Chrome
  behind a proxy hangs on the Google Fonts link (it ignores HTTPS_PROXY): render with the proxy set, or offline.
  `docs/flightsim-to.md`: flightsim.to page text. `docs/settings.md`: the user guide to every setting (keep it in step
  with the settings card). `CHANGELOG.md`: release history.
- `.github/workflows/check.yml`: syntax checks, plus `tools/check_pill.js` (readback hints and contact parsing
  on real lines; pattern speed on hostile input). CI can't build without a sim install.
- `.local/` (git-ignored): local config, mockups, design prototypes, screenshots. Put new private files there.

## Sim facts (verified live)

- In-flight fullscreen UI is the `mainUi` view. `MasterPage_InGame` mounts there only in flight.
  `Toolbar_Trigger` renders in the toolbar's own small Panel.html view instead: don't hook it.
- Clicks reach an element only if the element directly under the cursor has `data-input-group` and
  computed `pointer-events` isn't `none` (mainUi inherits `none`). Mousemove arrives regardless.
  A click on no element of ours never reaches the page (a document `mousedown` listener saw nothing), so the
  open settings card closes on outside clicks through a transparent full-screen `#batc-overlay-shade` with
  `data-input-group` (that click doesn't reach the sim; verified live 2026-10-23).
- `localStorage` is shared across all Coherent views but doesn't survive a sim restart (user report on 1.0.1,
  2026-10-26). `pill.js` saves settings to the sim's DataStorage too: `engine.trigger("ADD_VIEW_LISTENER",
  "JS_LISTENER_DATASTORAGE", "/Global/mainUI.html")`, then `window.datastorage.getData/setData` once it appears
  (Simple UI does this from mainUI). Verified: settings survive a sim restart (2026-10-28).
- mainUi has no `SimVar`, `GetStoredData` or `Coherent`; VCockpit views (e.g. VLogic) have `SimVar`.
- mainUi fonts: only `Roboto-Regular` / `RobotoMono-Regular`; weights are synthesized.
- Avoid `gap`, `color-mix`, `backdrop-filter` in pill.css (Gameface).
- mainUi has `engine` (`on`/`off`/`trigger`/`call`) and can receive sim key events:
  `engine.trigger("ADD_VIEW_LISTENER", "JS_LISTENER_KEYEVENT", "/Global/mainUI.html")`, then
  `engine.call("INTERCEPT_KEY_EVENT", "<EVENT>", 0|1)` (1 also stops the sim acting on it; verified with
  `BAROMETRIC`) and `engine.on("keyIntercepted", (name, v0, v1, v2) => ...)`. Each event arrives twice in
  the same ms. A held key sends once, then every ~33 ms after ~0.4 s; release sends nothing. //42 Flow's
  mainUi hook uses the same `ADD_VIEW_LISTENER` route (for `JS_LISTENER_DATASTORAGE`).
- mainUi can also fire sim key events: `engine.call("TRIGGER_KEY_EVENT", "COM2_STBY_RADIO_SET_HZ", true, 121725000, 0, 0)`
  moved COM2 standby (read back in VLogic, page 36, with `SimVar`; verified 2026-10-24, Fenix A320).
  mainUi can't read sim vars (no `simvar`; in-game panel views such as //42 Flow's have it). The Fenix RMP sets COM2
  only through key events mainUi can observe (intercept with 0): the knob is `COM2_RADIO_SWAP`, `COM2_RADIO_SET_HZ`
  <new standby>, `COM2_RADIO_SWAP`; the transfer button `COM2_RADIO_SET_HZ` <old standby>, then swap, set <old
  active>, swap; each event twice. `pill.js` follows COM2 from them (`onCom2Event`).
- Controls > Communications > QUICK REPLY is `KEY_SR_COM_QUICK_REPLY` (`fs-input-profiles`), event
  `SR_COM_QUICK_REPLY`. Blocking it (1) by hand froze the sim; observed (0), it is never reported.
  `pill.js` refuses `SR_` events. The PTT indicator uses `TOGGLE_SPEAKER` (works live, observed with 0).
- No gamepads in mainUi (`navigator.getGamepads()` is `[]` even after presses). A package can't add new
  actions to the Controls menu (MSFS 2024 SDK: presets of existing actions only).
- Rounded `overflow: hidden` boxes had jagged corners in the sim while the unclipped settings card was
  smooth; the pill now clips square and draws its rounded background on `.bp-bg`, with a dark rim
  (`rgba(0, 0, 0, 0.1)`) on the outer borders.

## BeyondATC protocol

- Snapshot pushed on connect; several clients are fine. `CommsState: {"mode","text"}` modes seen:
  `ready`, `queued`, `processing`, `request`, `awaiting`, `speaking` (binary also has `waiting`,
  `controller`, `loading`, `download`, `turnaround`, `menu`).
- `traffic` (`ATC Generating`, then `ATC Transmitting`) carries `ATCTraffic:` broadcasts ("All aircraft
  be advised information Z now current").
- `speaking` is used for ATC and for the pilot TTS; the preceding `ATC:`/`ATCTraffic:`, `Player:` or
  `Traffic:` line says who.
- `Facility: Name (runways)|freq` or `Nothing Tuned`; `Com2: {label,frequency,monitor}`;
  `LoadState: {stage,text,pct}` (`menu` in menus); `RadioMute: {com1,com2}`. Loading a flight (log 2026-10-27):
  `loading` (pct -1), then `download` steps with text and pct 0-90, `Callsign` at 10%, `Progress` at 90%, `ready`
  ~13 s after `loading`. `pill.js` shows "Loading flight" with a progress line, then callsign and route for `loadedMs`.
- `Actions: [Request IFR Clearance¬Wind Check¬...]`: the toolbar's menu, `¬`-separated. While ATC
  waits for you it offers `Say Again` (never in the request menu) with the replies: `Readback IFR
  Clearance¬Say Again¬`, `Acknowledge Instruction¬Say Again¬` (after "readback correct, call me back
  when ready"), `Cancel Runway Change¬Runway 12L¬Runway 12R¬Say Again¬` (after "say runway"). It keeps
  them until ATC confirms or moves on, and re-sends the menu after every transmission, so `pill.js`
  shows the hint only with a menu newer than the last speech (`menuFresh`) and not `answered` (a
  `Player:` line or `processing`/`request`/`queued` since ATC spoke). `QueuedAction` labels can be stale
  ("Say Again" while the pilot answers "Runway 12L"). Toolbar "Say Again" gives `Player: Say again, ...`.
  ATC chasing a missing reply: "Airfrans 1234, Montpellier Ground?", or the instruction again
  (`awaiting` with no queued request). BeyondATC drops taxi and acknowledge replies after ~18 s with no
  answer (menu back to requests, `pill.js` shows "No readback"); it keeps takeoff clearance and chases.
  A voice (PTT) reply is `processing` then `ready`, with no `Player:` line. `READBACKS` only shapes the hint.
  The same menu can span two exchanges: after a handoff's `Acknowledge Instruction¬Say Again¬`, your
  check-in and "Nantes Tower, continue." keep it unchanged, so `pill.js` treats an ATC line after your reply
  (or from a new station) as a new instruction, not a chase.
- `InfoBoxes: [{"title":"Taxi to Runway","info":"12L"},{"title":"SID","info":"KELA8L"},
  {"title":"Altitude Clearance","info":"FL060"},{"title":"Squawk","info":"1000"}]`: the toolbar's
  clearance boxes (`info` may hold `<br>`); `[]` at load, a CTAF box on UNICOM.
- `AutoTune: true|false`, `AutoRespond: true|false` (the toolbar switches). With Auto Tune off,
  `pill.js` keeps a "Contact" reminder from "contact <Station> [on] <freq>" until COM1 (`Facility`)
  matches. An `ATIS Current` box with a new letter shows "ATIS"; the snapshot's box doesn't, nor a PDC's own `ATIS`
  box (CPDLC clearance, 2026-10-27). A new station whose menu still offers "Announce On Frequency" after `checkInMs`
  (10 s, restarted by any exchange with ATC) shows amber "Check in", red-orange "Not checked in" after `checkInWarnMs` (60 s) (with Contact reminders, not with Auto Respond); seen
  2026-10-27: 3.5 min on Vancouver Centre 134.4 without checking in. ATC answering your reply with "unable ..."
  ("unable 15,000 at this time" after a `set_action: 15000`, menu back to requests) shows "Unable", not "Response OK".
  `CPDLCCode:` and other CPDLC traffic: the pill stays silent (CPDLC is fully handled in the sim).
  A CPDLC request (`CPDLC_Pilot: REQUEST DIRECT TO LTP`) gets `CPDLC_ATC: CLEARED DIRECT TO LTP` 15-35 s later, and
  BeyondATC flashes `CommsState` `request` (stale text, e.g. "Announce On Frequency") around that answer with no
  `processing`/`queued` before it (sniff 2026-10-26); `pill.js` ignores it while a CPDLC request is out. A PDC comes
  as `CPDLC_ATC: CLRD TO ...` with new `InfoBoxes` and no `CommsState`.
- What the toolbar sends (its panel `beyondatc_toolbar.js`, BeyondATC's package at
  `F:\FlightSimulator2024\Addons\Misc\beyondatc-toolbar`, read 2026-10-23): `set_autotune: <bool>`,
  `set_autorespond: <bool>` on its switches, `set_action: <reply>` on a menu item, `set_frequency: <f>`,
  `frequencies` / `datis` / `atc_log` on tab clicks. The toolbar has no COM2 (a frequency is a plain click:
  `set_frequency`) and lists `Frequencies` by type under the first entry's name, not by airport. BeyondATC broadcasts the resulting `AutoTune:` /
  `AutoRespond:` to every client (seen in sniffs when the toolbar switch was clicked).
- `AppError: {"text","fatal","kicked"}` (text may span lines; empty clears). `Callsign: {full,shortForm}`.
- The server pings (an empty frame); `sniff_batc.py` lost the connection after each one until it
  answered with a pong. Browsers pong on their own.
- A correct voice readback gets no answer from ATC: the toolbar just drops "Say Again" (`pill.js` shows
  "Readback OK" when that follows a reply). A wrong one gets "Negative, <correction>." with the menu kept
  (Player.log, 2026-10-23: 9 times in one flight). `Player.log` also has `[PilotSpeakState] ... waiting 10s for a
  player transcription | action=Acknowledge Instruction` after a voice exchange.
- Sniffs 2026-10-23 (LFMT-LIRF, LIRF-): a voice reply is `processing`, `ready`, then the request menu (no
  "Say Again"): accepted. After "Negative, ..." the same reply menu comes back unchanged. Checking in on a new
  frequency (`request` "Announce On Frequency"), BeyondATC flashes `Actions: [Say Callsign/Altitude¬Say Again¬]`
  for a few ms before ATC answers; `pill.js` ignores reply menus while `mode` is `request`/`processing`/`queued`.
  Right after an `Acknowledge Handoff` reply, BeyondATC retunes COM1 (`Facility`). Other types seen, unused:
  `Progress: {from,to,pct}`, `Settings: {...}` (BeyondATC's options), `CPDLC_ATC:` / `CPDLC_Pilot:`, `Wipe:`,
  `ToolbarVersion: 3.1`, `DATIS:` / `DATIS_END:`, `LoadState` stages `turnaround`, `download`.
- Unverified live: what `waiting` means. Whether "Say Again" leaves the menu after a voice reply the recogniser
  heard as nothing (`[VoiceRec] Empty final transcript ... Posting ParseFailed` in Player.log): ATC repeated the
  instruction each time so far, but if BeyondATC ever drops it instead, `pill.js` shows "Readback OK" wrongly.
- BeyondATC's own logs (`%userprofile%\AppData\LocalLow\Skirmish Mode Games, Inc\BeyondATC`):
  `Player.log` has every exchange as `[Instruction]` lines (ATC and pilot alike) and the script
  that handled it (`[ControllerScript] ...WindCheckScript`, `...IFR.IfrEvaluatorScript`), but no
  readback-expected state. Seen there: clearance "Airfrans 1234, Montpellier Ground, information D
  current, cleared to Marseille Provence via KELA8R departure, runway 30R, climb to 6000 feet, squawk
  1000.", toolbar readback, then "Airfrans 1234, readback correct. Call me back when ready for ...",
  then the pilot's "Wilco, Airfrans 1234.". `beyondATC.log` (CPDLC bridge) holds the Hoppie logon
  code: keep it private.
- Nothing is sent while PTT is held. The PTT indicator instead listens to a sim binding (below).
- `frequencies` gets `Frequencies: [{"name","type","frequency","cpdlcLogonCode"},...]` (BeyondATC sends it only when
  asked). Captured 2026-10-24 (LIRF-LFMT, at the gate): both airports of the route, no airport field. Each airport is
  a block in reverse calling order ending with its ATIS, whose name is the ICAO ("LIRF"); then the Center ("Roma
  Radar", `cpdlcLogonCode` "LIRR"). Types seen: ATIS, Clearance ("FIUME"), Ground, Tower, Departure, Approach, UNICOM,
  Center (the toolbar also knows ApproachDeparture). `pill.js` splits after each ATIS, files the blocks by ICAO (no
  ATIS: Progress from/to by position), and shows Departure / Arrival by `Progress: {from,to,pct}` with Center under
  "En route". Without Progress the tab shows the reply as is. Asked when the panel opens and when COM1 changes with
  Frequencies open. Since 2026-10-27 (CYVR-CYYC) each row also has `airport` (ICAO; "" for Center), `airportName`,
  `runways` ("26L"; a Tower/Ground/Approach per runway) and `stationType` (""), and a new type FlightService ("PACIFIC
  RADIO"); same block order. `pill.js` files by `airport` when present and tags each frequency with its runways.
  The same reply came at the gate, mid-flight and at arrival.
- Sniff digest (11 sniffs, 2026-10-22/23, incl. LFMT-LIRF 127 min): `Progress` pct is 0-100, from/to are ICAO, about
  once a minute in flight. No `Actions` request carries a parameter: requests that need one (direct-to fixes, arrival
  gates) get a follow-up reply menu once ATC asks. A command a client sends (toolbar, Auto Respond) is never echoed:
  it shows as `QueuedAction` + `queued`, then a `Player:` line. `CPDLCCode:` was empty in every sniff.
  Follow-up menus: "say fix name" gives `Cancel Direct Request¬<the route's fixes, repeats included>¬Say Again¬`
  (33 fixes), "say parking" `Allocated Gate¬Gate 301¬...¬Say Again¬` (74 gates), a STAR `Accept Clearance¬Request
  Different Runway¬Say Again¬`, a voice direct-to request "say callsign" `Say Callsign¬Say Again¬`. `pill.js` shows
  answers once each, Cancel last, three then "+N" (the opened list scrolls), and fills amber a readback,
  acknowledgement, "Accept", "Allocated" or a lone answer. Other menus seen: Acknowledge Cross Instruction /
  Takeoff Clearance / Landing Clearance / Handoff, Readback Instruction, `Acknowledge Instruction¬Ready for
  Descent¬Say Again¬`; requests Report Established, Declare Go Around, Report Clear of Runway, Request Taxi to
  (Assigned) Gate, Submit Turbulence / Icing Pirep, Call Ready for Descent, "Announce On/on Frequency" (both casings).
  While a flight loads: `LoadState` `loading` / `download` with text and pct, `Wipe:`, `RadioMute` true then false,
  and `Facility: 121.955|121.955` (the frequency as the name) before the station's. `DATIS: <ICAO>|<letter>|<text>`
  per airport in the snapshot, then `DATIS_END:`. On an ATIS frequency the menu is `Actions: []`.
- Comms panel, verified live 2026-10-27: `set_frequency` sets COM1 active; a right click reaches mainUi and the Fenix
  followed `COM2_RADIO_SET_HZ` (sent by the pill then); `set_frequency_com2` also sets the Fenix's COM2 (verified live
  2026-10-27, now the pill's right click); `set_action` from the pill is taken like the toolbar's (`queued`, then `Player:`), for
  answers and requests; a `set_action` the current `Actions` doesn't list is silently ignored. Not yet verified: what
  `atc_log` returns (not sent; the Log is built from the stream); whether wheel events reach mainUi (the Log scrolls).
- BeyondATC's own socket handler (`Echo.OnMessage` in `BeyondATC_Data\Managed\Assembly-CSharp.dll`, read as IL with
  the `dnfile` / `dncil` Python packages, 2026-10-27) takes more than the toolbar sends. Payloads split on ":" and are
  trimmed. `set_frequency_com2: <f>` (SimConnect, as COM1: its `BatcSimConnect.dll` holds `COM2_STBY_RADIO_SET_HZ`,
  `COM2_RADIO_SWAP`, `COM2_RADIO_SET_HZ`; works on the Fenix, verified live 2026-10-27), `start_flight: <mode>` (the app's Start
  button; `IFR`, or anything starting `VFR`, `VFR_MSFS` for the MSFS plan; ignored with a flight active or within 3 s;
  saves the flight type as the app's setting; uses the SimBrief ID set in the app, else an `AppError`),
  `quit_to_menu`, `turnaround` (the app's SimBrief download, only when no plan is downloaded or downloading),
  `prompt_reply: <id>:yes|no`, `ack_error` (closes the error in the app too, verified live 2026-10-27), `play_sample: autoRespond|controller|traffic`, `settings`,
  `set_setting: {"key","value"}` (voiceVolume, uiSounds, controllerVoice, trafficVoice, trafficOn, the four densities,
  navigraphLiveTraffic, taxiArrowsShown, dynamicVoiceOn, dynamicVoiceGender, autoRespondVoice), `ping` (`Pong:`).
  `LoadState` stages from its code: `menu` (no flight), `loading` (app not ready, or holding after a wipe), `ready`
  (plan downloaded), `download`, `turnaround` (a plan was downloaded this session and is gone: at the gate after a
  leg, seen in two flights; also after a failed download, "Ensure you have generated your next planned leg"),
  `waiting` ("Waiting for Flight Plan...", never seen). `Prompt: {id,title,text,yesLabel,noLabel}` (empty when none;
  the one in the code: `liveTrafficTime` during loading, live traffic with a sim clock off real time). `CommsState`
  text names the transmitter: ATC, Traffic, ATIS, AWOS, ASOS, AWIS, AWIB. `Donut:` is an easter egg.
- A faded-out chip column still took clicks (chips set `pointer-events: auto` and carry `data-input-group`), so the
  answer under a message got the invisible request above it (flight 2026-10-27, 5 times). Closed columns and rows now
  untag their chips and set `pointer-events: none`; `onChip` sends only what `Actions` offers.

## Rules

- Never commit Asobo files (cooked components, vanilla UI); the build copies them from the local install.
- Never commit design or prototype files (mockups, clickable prototypes): keep them in `.local/`.
- The pill sends no sim commands (COM2 goes through BeyondATC's `set_frequency_com2`).
- Never send anything on the BeyondATC socket except, on the user's click, the toolbar's own commands:
  `set_autotune: true|false`, `set_autorespond: true|false` (the hover buttons), and for the comms panel
  `set_action: <label>` (an answer or request, exactly as `Actions` lists it),
  `set_frequency: <f>`, and the tab requests `frequencies` / `atc_log`; and these from BeyondATC's own command set
  (below): `set_frequency_com2: <f>` (right click on a frequency), `start_flight: IFR` (Start IFR flight, in
  BeyondATC's menu), `turnaround` (Load Next Leg, at the gate), `prompt_reply: <id>:yes|no` (the answers to `Prompt`),
  `ack_error` (the error's ✕). WebSocket pongs aside.
- Changelogs and release notes list what changed, not why.
