# flightsim.to page

Main image: `docs/images/splash.png` (1920x1080). Gallery: `docs/images/states.png`, `docs/images/settings.png`.

## Title

BATC Comms Pill (BeyondATC radio status)

## Short description

A small pill in the corner of the screen that shows what BeyondATC is doing on the radio.

## Description

A small, quiet pill in a corner of the screen that shows what BeyondATC is doing on the radio, so you can keep the BeyondATC toolbar closed.

**What it shows**
- Queued, Processing and Awaiting ATC while your request is on its way
- ATC talking, with the station and frequency (amber)
- You talking, while your readback or request plays (green)
- Radio changes: the new station when COM1 or COM2 changes (cyan)
- A muted COM1, AI traffic talking, and BeyondATC offline

When nothing is happening it shrinks to a small dot. Changes between states are animated.

**Settings**
Click the pill in flight to open its settings: corner, position, size, and which events to show.

**Requirements**
- Microsoft Flight Simulator 2024
- BeyondATC 3.x desktop app (the toolbar panel doesn't need to be open)

**Installation**
Extract the `paul-batc-pill` folder into your Community folder.

**Notes**
- The pill reads BeyondATC's local connection and never sends anything to it.
- PTT state isn't shown: BeyondATC reads your PTT button directly, and nothing in the sim exposes it.
- The mod overrides one stock UI component (`MasterPage_InGame`) to load. Another mod that overrides the same component will conflict with it. After a sim update that changes it, install the updated version.
- Not affiliated with BeyondATC or Microsoft.

Source and issues: https://github.com/paul-charp/FS24-BATC-Pill

## Changelog (0.1.0)

- First release.
