# flightsim.to page

Main image: `docs/images/splash.png` (1920x1080). Gallery: `docs/images/comms.png`, `docs/images/panel.png`,
`docs/images/states.png`, `docs/images/settings.png`.

## Title

BATC Comms Pill (BeyondATC radio status, messages and replies)

## Keywords

BeyondATC, BATC, ATC, radio, comms, status, indicator, overlay, HUD, UI, toolbar, notification, readback, subtitles, COM1, COM2, frequency, MSFS 2024, utility

## Short description

A small, quiet pill in a corner of the screen that shows what BeyondATC is doing on the radio, with ATC's messages under it and your answers, requests and frequencies one hover or click away.

## Description

A small, quiet pill in a corner of the screen that shows what BeyondATC is doing on the radio, and does what the BeyondATC toolbar does around it, so you can keep the toolbar closed.

**Messages, answers and requests**
- ATC's messages (and yours) show under the pill. An exchange's messages leave together once it's over; AI traffic's can be shown too
- Hover the message ATC waits on, or the pill, and its answers open below it: one click to read back, acknowledge or answer a question
- With nothing pending, hover the pill for BeyondATC's requests (clearance, push, taxi, direct to, ...)
- With Auto Tune off, "Tune" sets COM1 to the station ATC handed you to
- Click the pill for a panel with the frequencies (Departure / Arrival) and the radio log
- In the bottom corners everything stacks upward; in the left corners it's mirrored

**What it shows**
- Queued, Processing and Awaiting ATC while your request is on its way
- ATC talking, with the station and frequency (amber)
- Awaiting readback / Awaiting response: what ATC is waiting for from you, as a short hint ("Taxi via T1 · Hold short 12L"), the clearance values or the toolbar's clearance boxes. Red-orange when ATC calls you again or answers "Negative" with a correction, green when ATC takes your reply, and "No readback" if BeyondATC gives up waiting
- Transmitting, while your readback or request plays (green), and optionally while you hold PTT, with the hint of the readback you're answering
- Radio changes: the new station when COM1 or COM2 changes (cyan), and with Auto Tune off, whom to contact
- A new ATIS letter, ATC calling while COM1 is muted, AI traffic talking, and BeyondATC offline

When nothing is happening it shrinks to a small dot. Changes between states are animated.

**Settings**
Hover the pill for two buttons that flip BeyondATC's Auto Tune and Auto Respond. Click the pill, then the gear in its panel, to open the settings (a click outside closes them): which events and messages to show and how much detail (Display tab), corner, position and size (Position tab).

**Requirements**
- Microsoft Flight Simulator 2024
- BeyondATC 3.x desktop app (the toolbar panel doesn't need to be open)

**Installation**
Extract the `paul-batc-pill` folder into your Community folder.

**Notes**
- The pill reads BeyondATC's local connection. It only sends what the toolbar sends, when you click: an answer or request, a frequency, the frequency list, and Auto Tune / Auto Respond.
- Optional PTT indicator: bind your PTT button a second time to the sim's Toggle Speaker (Controls > Communications), keeping BeyondATC's binding, then turn it on in the settings.
- CPDLC is left to the sim's own datalink pages.
- The mod overrides one stock UI component (`MasterPage_InGame`) to load. Another mod that overrides the same component will conflict with it. After a sim update that changes it, install the updated version.
- Not affiliated with BeyondATC or Microsoft.

Source and issues: https://github.com/paul-charp/FS24-BATC-Pill

## Changelog

2.0.0

- Added: ATC's messages under the pill (Off / Mine / All); an exchange's messages leave together once it's over.
- Added: hover the message ATC waits on, or the pill, to answer it in one click.
- Added: hover the pill with nothing pending for BeyondATC's requests.
- Added: with Auto Tune off, "Tune" sets COM1 to the station ATC handed you to.
- Added: click the pill for a panel with Frequencies (Departure / Arrival, click to tune COM1) and the radio Log.
- Added: hovering the pill shows buttons for BeyondATC's Auto Tune and Auto Respond.
- Added: readback hints. While ATC waits for your readback, acknowledgement or answer, the pill shows "Awaiting readback" or "Awaiting response" with a short hint, the toolbar's clearance boxes or their values.
- Added: the pill turns red-orange when ATC calls you again before you reply, and shows "No readback" when BeyondATC stops waiting.
- Added: a green "Readback OK" when ATC takes your reply, and a red-orange "Negative" with the correction when ATC rejects it.
- Added: optional "Keep last clearance": the last clearance stays on the pill until the next one.
- Added: hints for pushback, line up, go around, speeds, STARs, runway exits, "say ..." requests and taxi to a ramp, gate or stand.
- Added: with Auto Tune off, a "Contact" reminder until COM1 is on the station ATC handed you to.
- Added: a new ATIS letter shows for 6 s; an ATIS playing on COM1 shows "ATIS".
- Added: ATC calling you while COM1 is muted turns the pill red-orange.
- Added: optional PTT indicator, red-orange when you transmit over ATC or traffic.
- Changed: "You" is now "Transmitting", and keeps the hint while you answer a readback.
- Changed: the settings card opens from the panel's gear, has Display and Position tabs, and closes on a click outside it.
- Fixed: the idle dot stayed visible in the sim's menus after a flight.
- Fixed: BeyondATC errors, ATC broadcasts and ATIS showed raw or wrong text.
- Fixed: radio changes showed while a flight was loading.

1.0.1

- Fixed: the pill stretched across the whole screen at startup when BeyondATC wasn't running.

1.0.0

- First release.
