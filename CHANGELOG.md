# Changelog

## 2.0.0 (unreleased)

Reply to ATC and make requests from the pill, without BeyondATC's toolbar.

- Added: ATC's messages appear under the pill. Choose Off, Mine (only your conversations) or All.
- Added: hover the pill or the message ATC is waiting on to see your possible answers.
- Added: hover the pill when the radio is quiet, or while only other aircraft are talking, to see the requests you can make.
- Added: with Auto Tune off, a "Tune" button sets COM1 to the next station after a handoff.
- Added: click the pill to open the Frequencies and Log panel. Frequencies lists the departure and arrival airports' stations, one row each with its frequencies and the runways they serve; the Log starts over when you change COM1. A click elsewhere closes the panel.
- Added: Auto Tune and Auto Respond buttons next to the pill.
- Added: readback hints. When ATC waits for your reply, the pill says so and shows what to read back: a short hint, the values, or the clearance boxes. The boxes stay on the pill until the readback is over.
- Added: the pill turns red-orange when ATC calls you again ("×2", "×3"), when ATC corrects a wrong readback ("Negative"), and when ATC calls you while COM1 is muted.
- Added: "No readback" when BeyondATC gives up waiting for your reply.
- Added: "Readback OK" in green when ATC accepts your reply.
- Added: optional "Keep last clearance", which keeps your last clearance on the pill, dimmed.
- Added: a "Contact" reminder when Auto Tune is off and ATC hands you to another station.
- Added: a "Check in" reminder when you haven't announced yourself on a new station after 10 s, and a "Not checked in" warning after a minute.
- Added: "Unable" when ATC turns down your request.
- Added: new ATIS letters, and "ATIS" while one plays on COM1.
- Added: optional PTT indicator, which turns red-orange if you talk over ATC or traffic.
- Added: "Waiting for BATC" when BeyondATC is running without a flight (the pill used to hide).
- Changed: "You" is now "Transmitting".
- Changed: settings are split into Display and Position tabs, and open from the gear in the panel (closing them goes back to the panel), or from a click on the pill while BeyondATC is offline or has no flight.
- Changed: the sample pill in the settings shows what your last change does, with sample station names.
- Changed: the kept clearance can be closed while other aircraft or ATC to them are talking.
- Fixed: settings were lost when the sim restarted.
- Fixed: the idle dot stayed on screen in the sim's menus after a flight.
- Fixed: BeyondATC errors showed as raw code.
- Fixed: ATC broadcasts to all aircraft showed "ATC Generating" / "ATC Transmitting".
- Fixed: an ATIS on COM1 showed as "Traffic" or "Service".
- Fixed: radio changes showed while a flight was loading.
- Fixed: CPDLC requests showed "Processing", then the station.

## 1.0.1 (2026-10-20)

- Fixed: the pill stretched across the whole screen at startup when BeyondATC wasn't running.

## 1.0.0 (2026-10-20)

- First release.
