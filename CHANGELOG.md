# Changelog

## 1.1.0 (unreleased)

- Added: readback hints. While ATC waits for your readback, acknowledgement or answer, the pill shows "Awaiting readback" or "Awaiting response" with a short hint, the toolbar's clearance boxes or their values (None / Short / Hint / Boxes).
- Added: the pill turns red-orange when ATC calls you again before you reply ("×2", "×3"), and shows "No readback" when BeyondATC stops waiting.
- Added: with Auto Tune off, a "Contact" reminder until COM1 is on the station ATC handed you to.
- Added: a new ATIS letter shows for 6 s; an ATIS playing on COM1 shows "ATIS".
- Added: ATC calling you while COM1 is muted turns the pill red-orange.
- Added: optional PTT indicator, from your PTT button also bound to the sim's Toggle Speaker.
- Changed: "You" is now "Transmitting" while your readback or request plays.
- Changed: the settings card has two tabs, Display and Position.
- Changed: with the settings card open, the sample pill shows the effect of the last setting changed for 4 s.
- Fixed: the idle dot stayed visible in the sim's menus after a flight.
- Fixed: BeyondATC errors showed as raw JSON.
- Fixed: ATC broadcasts to all stations showed "ATC Generating" / "ATC Transmitting".
- Fixed: an ATIS on COM1 showed as "Traffic" or "Service".
- Fixed: radio changes showed while a flight was loading.
- Fixed: `sniff_batc.py` disconnected after BeyondATC's first ping.

## 1.0.1 (2026-10-20)

- Fixed: the pill stretched across the whole screen at startup when BeyondATC wasn't running.

## 1.0.0 (2026-10-20)

- First release.
