# flightsim.to page

Main image: `docs/images/splash.png`. Gallery: `docs/images/detail.png`, `docs/images/assist.png`,
`docs/images/toolbar.png`. All 1920x1080.

## Title

BATC Overlay (BeyondATC in the sim: radio status, messages, replies and frequencies)

## Keywords

BeyondATC, BATC, ATC, radio, comms, status, indicator, overlay, HUD, UI, toolbar, notification, readback, subtitles, COM1, COM2, frequency, MSFS 2024, utility

## Short description

BeyondATC, inside Microsoft Flight Simulator 2024: ATC's messages, your answers and requests, the frequencies and the radio log, around a small pill in a corner. It replaces the BeyondATC toolbar and shows as little or as much as you want.

## Description

BeyondATC, inside the sim. A small pill in a corner of the screen shows what's happening on the radio, and everything the BeyondATC toolbar does sits around it: ATC's messages, your answers and requests, the frequencies and the radio log. Keep the toolbar closed.

**Replaces the toolbar**
- ATC's messages (and yours) under the pill. An exchange's messages leave together once it's over; AI traffic's can be shown too
- Hover the message ATC waits on, or the pill, and its answers open below it: one click to read back, acknowledge or answer a question
- With nothing pending, hover the pill for BeyondATC's requests (clearance, push, taxi, direct to, ...)
- Auto Tune and Auto Respond switches next to the pill
- Click the pill for a panel with your callsign and route, the frequencies (Departure / Arrival / En route; click for COM1, right click for COM2) and the radio log
- Start a flight from BeyondATC's menu, load your next leg at the gate, answer BeyondATC's questions and dismiss its errors

**Stays out of the way**
- A small dot while the radio is quiet; it grows only when something happens, with animated changes
- Any corner, any offset, 60% to 250% size. In the bottom corners everything stacks upward; in the left corners it's mirrored
- The panel doesn't block the cockpit: leave it open and keep flying

**Your level of detail**
- From a status alone ("Awaiting readback") to a hint ("Taxi via T1 · Hold short 12L"), the clearance values or the toolbar's clearance boxes
- Messages Off, Mine (your exchanges) or All (with AI traffic)
- Turn off what you don't want: radio changes, contact reminders, ATIS, AI traffic, ...
- Click the pill, then the gear in its panel, for the settings (Display and Position tabs)

**It has your back**
- Red-orange when ATC calls you again (×2), corrects your readback ("Negative"), or calls while COM1 is muted
- Contact: with Auto Tune off, the station ATC handed you to, until COM1 is on it ("Tune" sets it)
- Check in, when a new station waits for you to announce yourself
- Readback OK when ATC takes your reply, No readback when BeyondATC gives up waiting, Unable when ATC turns you down

**Also shown**
Queued, Processing and Awaiting ATC while your request is on its way; ATC talking, with the station and frequency; Transmitting while your readback or request plays (optionally while you hold PTT); radio changes on COM1 and COM2; new ATIS letters; Loading flight with your callsign; BeyondATC offline.

**Requirements**
- Microsoft Flight Simulator 2024
- BeyondATC 3.x desktop app (the toolbar panel doesn't need to be open)

**Installation**
Extract the `paulcharp-batc-overlay` folder into your Community folder.
Updating from 1.x: delete the old `paul-batc-pill` folder first.

**Notes**
- The pill reads BeyondATC's local connection. It only sends BeyondATC commands, when you click: an answer or request, a frequency (COM1 or COM2), the frequency list, Auto Tune / Auto Respond, Start flight, Load Next Leg, the answer to a BeyondATC question, and dismissing an error.
- Optional PTT indicator: bind your PTT button a second time to the sim's Toggle Speaker (Controls > Communications), keeping BeyondATC's binding, then turn it on in the settings.
- CPDLC is left to the sim's own datalink pages.
- The mod overrides one stock UI component (`MasterPage_InGame`) to load. Another mod that overrides the same component will conflict with it. After a sim update that changes it, install the updated version.
- Not affiliated with BeyondATC or Microsoft.

Source and issues: https://github.com/paul-charp/FS24-BATC-Overlay

## Changelog

2.0.0

BeyondATC's toolbar, in the sim: ATC's messages, your answers and requests, the frequencies and the radio log around the pill, with as much detail as you want.

- Added: ATC's messages appear under the pill. Choose Off, Mine (only your conversations) or All.
- Added: hover the pill or the message ATC is waiting on to see your possible answers.
- Added: hover the pill when the radio is quiet, or while only other aircraft are talking, to see the requests you can make.
- Added: with Auto Tune off, a "Tune" button sets COM1 to the next station after a handoff.
- Added: click the pill to open the Frequencies and Log panel, with your callsign and route at the top.
- Added: Auto Tune and Auto Respond buttons next to the pill.
- Added: readback hints. When ATC waits for your reply, the pill says so and shows what to read back: a short hint, the values, or the clearance boxes.
- Added: the pill turns red-orange when ATC calls you again ("×2", "×3"), when ATC corrects a wrong readback ("Negative"), and when ATC calls you while COM1 is muted.
- Added: "No readback" when BeyondATC gives up waiting for your reply.
- Added: "Readback OK" in green when ATC accepts your reply.
- Added: "Not heard" when BeyondATC didn't take your voice reply.
- Added: optional "Keep last clearance", which keeps your last clearance on the pill, dimmed.
- Added: a "Contact" reminder when Auto Tune is off and ATC hands you to another station.
- Added: a "Check in" reminder when you haven't announced yourself on a new station after 10 s, and a "Not checked in" warning after a minute.
- Added: "Unable" when ATC turns down your request.
- Added: new ATIS letters, and "ATIS" while one plays on COM1.
- Added: optional PTT indicator, which turns red-orange if you talk over ATC or traffic.
- Added: turning COM2 receive off shows the station with a mute icon.
- Added: "Waiting for BATC" when BeyondATC is running without a flight (the pill used to hide).
- Added: "Loading flight" with your callsign and a progress line while BeyondATC loads a flight, then your callsign and route.
- Added: "Start IFR flight" and "Load Next Leg" from the pill.
- Added: BeyondATC's questions show on the pill, with their answers.
- Added: a ✕ to dismiss BeyondATC errors, and long errors show in full.
- Changed: renamed BATC Overlay.
- Changed: the package folder is now `paulcharp-batc-overlay`. Delete the old `paul-batc-pill` folder from Community when you install it. Your settings are kept.
- Changed: "You" is now "Transmitting".
- Changed: settings are split into Display and Position tabs, and open from the gear in the panel.
- Changed: the sample pill in the settings shows what your last change does.
- Changed: the kept clearance can be closed while other aircraft or ATC to them are talking.
- Changed: a right click on a frequency sets COM2 through BeyondATC.
- Changed: a softer, darker edge around the pill and its panels.
- Fixed: settings were lost when the sim restarted.
- Fixed: the idle dot stayed on screen in the sim's menus after a flight.
- Fixed: BeyondATC errors showed as raw code.
- Fixed: ATC broadcasts to all aircraft showed "ATC Generating" / "ATC Transmitting".
- Fixed: an ATIS on COM1 showed as "Traffic" or "Service".
- Fixed: AWOS, ASOS, AWIS and AWIB stations on COM1 showed as "Traffic".
- Fixed: radio changes showed while a flight was loading.
- Fixed: CPDLC requests showed "Processing", then the station.
- Fixed: airport names that lost their punctuation ("Marseilleprovence") show in full.

1.0.1

- Fixed: the pill stretched across the whole screen at startup when BeyondATC wasn't running.

1.0.0

- First release.
