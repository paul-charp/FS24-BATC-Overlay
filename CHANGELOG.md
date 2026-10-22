# Changelog

## Unreleased

- Added: readback hints: while ATC waits for your readback, acknowledgement or answer, the pill says so ("Readback hints" setting), with a short hint, the toolbar's clearance boxes, or no detail ("Detail" setting). The pill turns red-orange when ATC calls you again before you reply, and shows "No readback" when BeyondATC stops waiting without one.
- Fixed: ATC broadcasts to all stations showed "ATC Generating" / "ATC Transmitting".
- Added: with Auto Tune off, a "Contact" reminder until COM1 is on the station ATC handed you to ("Contact reminders" setting).
- Added: a new ATIS letter shows for 6 s ("ATIS changes" setting).
- Added: ATC calling you while COM1 is muted turns the pill red-orange ("Muted ATC calls" setting).
- Changed: with the settings card open, the sample pill shows the effect of the last setting changed.
- Fixed: BeyondATC errors showed as raw JSON.
- Fixed: the idle dot stayed visible in the sim's menus after a flight.
- Fixed: `sniff_batc.py` disconnected after BeyondATC's first ping.

## 1.0.1 (2026-10-20)

- Fixed: the pill stretched across the whole screen at startup when BeyondATC wasn't running.

## 1.0.0 (2026-10-20)

- First release.
