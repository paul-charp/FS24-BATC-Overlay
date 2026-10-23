# flightsim.to page

Main image: `docs/images/splash.png` (1920x1080). Gallery: `docs/images/states.png`, `docs/images/settings.png`.

## Title

BATC Comms Pill (BeyondATC radio status)

## Keywords

BeyondATC, BATC, ATC, radio, comms, status, indicator, overlay, HUD, UI, toolbar, notification, COM1, COM2, frequency, MSFS 2024, utility

## Short description

A small, quiet pill in a corner of the screen that shows what BeyondATC is doing on the radio: requests, ATC talking, the readback ATC is waiting for, and radio changes.

## Description

A small, quiet pill in a corner of the screen that shows what BeyondATC is doing on the radio, so you can keep the BeyondATC toolbar closed.

**What it shows**
- Queued, Processing and Awaiting ATC while your request is on its way
- ATC talking, with the station and frequency (amber)
- Awaiting readback / Awaiting response: what ATC is waiting for from you, as a short hint ("Taxi via T1 · Hold short 12L"), the clearance values or the toolbar's clearance boxes. Red-orange when ATC calls you again or answers "Negative" with a correction, green when ATC takes your reply, and "No readback" if BeyondATC gives up waiting
- Transmitting, while your readback or request plays (green), and optionally while you hold PTT
- Radio changes: the new station when COM1 or COM2 changes (cyan), and with Auto Tune off, whom to contact
- A new ATIS letter, ATC calling while COM1 is muted, AI traffic talking, and BeyondATC offline

When nothing is happening it shrinks to a small dot. Changes between states are animated.

**Settings**
Hover the pill for two buttons that flip BeyondATC's Auto Tune and Auto Respond. Click the pill in flight to open its settings: which events to show and how much detail (Display tab), corner, position and size (Position tab).

**Requirements**
- Microsoft Flight Simulator 2024
- BeyondATC 3.x desktop app (the toolbar panel doesn't need to be open)

**Installation**
Extract the `paul-batc-pill` folder into your Community folder.

**Notes**
- The pill reads BeyondATC's local connection. The only thing it sends is the Auto Tune / Auto Respond commands, when you click their buttons (as the toolbar does).
- Optional PTT indicator: bind your PTT button a second time to the sim's Toggle Speaker (Controls > Communications), keeping BeyondATC's binding, then turn it on in the settings.
- CPDLC is left to the sim's own datalink pages.
- The mod overrides one stock UI component (`MasterPage_InGame`) to load. Another mod that overrides the same component will conflict with it. After a sim update that changes it, install the updated version.
- Not affiliated with BeyondATC or Microsoft.

Source and issues: https://github.com/paul-charp/FS24-BATC-Pill

## Changelog

1.1.0

- Added: readback hints. While ATC waits for your readback, acknowledgement or answer, the pill shows "Awaiting readback" or "Awaiting response" with a short hint, the toolbar's clearance boxes or their values.
- Added: the pill turns red-orange when ATC calls you again before you reply, and shows "No readback" when BeyondATC stops waiting.
- Added: a green "Readback OK" when ATC takes your reply, and a red-orange "Negative" with the correction when ATC rejects it.
- Added: hovering the pill shows buttons for BeyondATC's Auto Tune and Auto Respond.
- Added: hints for line up, go around, speeds, STARs, "report" requests and taxi to a ramp or gate.
- Added: with Auto Tune off, a "Contact" reminder until COM1 is on the station ATC handed you to.
- Added: a new ATIS letter shows for 6 s; an ATIS playing on COM1 shows "ATIS".
- Added: ATC calling you while COM1 is muted turns the pill red-orange.
- Added: optional PTT indicator.
- Changed: "You" is now "Transmitting"; the settings card has Display and Position tabs.
- Fixed: the idle dot stayed visible in the sim's menus after a flight.
- Fixed: BeyondATC errors, ATC broadcasts and ATIS showed raw or wrong text.
- Fixed: radio changes showed while a flight was loading.

1.0.1

- Fixed: the pill stretched across the whole screen at startup when BeyondATC wasn't running.

1.0.0

- First release.
