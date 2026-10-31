# Changelog

## 2.0.0 (2026-10-31)

BeyondATC's toolbar, in the sim: ATC's messages, your answers and requests, the frequencies and the radio log around the pill, with as much detail as you want.

- Added: ATC's messages appear under the pill. Choose Off, Mine (only your conversations) or All.
- Added: hover the pill or the message ATC is waiting on to see your possible answers.
- Added: hover the pill when the radio is quiet, or while only other aircraft are talking, to see the requests you can make.
- Added: with Auto Tune off, a "Tune" button sets COM1 to the next station after a handoff.
- Added: click the pill to open the Frequencies and Log panel, with your callsign and route at the top. Frequencies lists the departure and arrival airports' stations, one row each with its frequencies and the runways they serve; the Log starts over when you change COM1. A click elsewhere closes the panel.
- Added: Auto Tune and Auto Respond buttons next to the pill.
- Added: readback hints. When ATC waits for your reply, the pill says so and shows what to read back: a short hint, the values, or the clearance boxes. The boxes stay on the pill until the readback is over.
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
- Added: "Loading flight" with your callsign and a progress line while BeyondATC loads a flight, then your callsign and route for 8 s (in boxes with the Boxes readback detail).
- Added: "Start IFR flight" when you hover the pill while BeyondATC is in its menu.
- Added: "Load Next Leg" when you hover the pill at the gate after a flight; it downloads your next SimBrief plan.
- Added: BeyondATC's questions (live traffic with a sim clock that isn't real time) show on the pill, with their answers.
- Added: a ✕ on BeyondATC errors that dismisses them in BeyondATC too. Errors that stop BeyondATC stay until dismissed, and long errors show in full.
- Changed: renamed BATC Overlay.
- Changed: the package folder is now `paulcharp-batc-overlay`. Delete the old `paul-batc-pill` folder from Community when you install it. Your settings are kept.
- Changed: "You" is now "Transmitting".
- Changed: settings are split into Display and Position tabs, and open from the gear in the panel (closing them goes back to the panel), or from a click on the pill while BeyondATC is offline, has no flight or is loading one.
- Changed: the sample pill in the settings shows what your last change does, with sample station names.
- Changed: the kept clearance can be closed while other aircraft or ATC to them are talking.
- Changed: a right click on a frequency sets COM2 through BeyondATC.
- Changed: a softer, darker edge around the pill and its panels.
- Fixed: settings were lost when the sim restarted.
- Fixed: AWOS, ASOS, AWIS and AWIB stations on COM1 showed as "Traffic".
- Fixed: the idle dot stayed on screen in the sim's menus after a flight.
- Fixed: BeyondATC errors showed as raw code.
- Fixed: ATC broadcasts to all aircraft showed "ATC Generating" / "ATC Transmitting".
- Fixed: an ATIS on COM1 showed as "Traffic" or "Service".
- Fixed: radio changes showed while a flight was loading.
- Fixed: CPDLC requests showed "Processing", then the station.
- Fixed: airport names that lost their punctuation ("Marseilleprovence") show in full.

## 1.0.1 (2026-10-20)

- Fixed: the pill stretched across the whole screen at startup when BeyondATC wasn't running.

## 1.0.0 (2026-10-20)

- First release.
