# Changelog

## Unreleased

- Added: readback hints: while ATC waits for your readback, acknowledgement or answer, the pill shows a short hint ("Readback hints" setting) or the toolbar's clearance boxes ("Clearance boxes" setting). The pill turns red-orange when ATC calls you again before you reply, and shows "No readback" when BeyondATC stops waiting without one.
- Fixed: ATC broadcasts to all stations showed "ATC Generating" / "ATC Transmitting".
- Fixed: BeyondATC errors showed as raw JSON.
- Fixed: `sniff_batc.py` disconnected after BeyondATC's first ping.

## 1.0.1 (2026-10-20)

- Fixed: the pill stretched across the whole screen at startup when BeyondATC wasn't running.

## 1.0.0 (2026-10-20)

- First release.
