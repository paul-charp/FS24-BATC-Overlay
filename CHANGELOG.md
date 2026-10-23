# Changelog

## 1.2.0 (unreleased)

- Added: ATC's messages under the pill (Messages: Off / Mine / All). An exchange's messages leave together 5 s after it closes.
- Added: hovering the message ATC waits on, or the pill, shows its answers below it; a click sends the answer.
- Added: hovering the pill with nothing pending shows BeyondATC's requests in a column under it; a click sends the request.
- Added: with Auto Tune off, "Tune" after you acknowledge a handoff sets COM1 to the new station.
- Added: clicking the pill opens a panel with Frequencies (click a station to tune COM1) and Log.
- Changed: the settings card opens from the gear in the panel.
- Changed: the Auto Respond / Auto Tune buttons sit beside the pill instead of under it.

## 1.1.0 (unreleased)

- Added: readback hints. While ATC waits for your readback, acknowledgement or answer, the pill shows "Awaiting readback" or "Awaiting response" with a short hint, the toolbar's clearance boxes or their values (None / Short / Hint / Boxes).
- Added: the pill turns red-orange when ATC calls you again before you reply ("×2", "×3"), and shows "No readback" when BeyondATC stops waiting.
- Added: when ATC takes your reply, the pill turns green for 1.5 s ("Readback OK" with the hint); after a handoff with Auto Tune on, the new station shows instead.
- Added: optional "Keep last clearance": the last reply ATC took stays on the pill, dimmed, until the next instruction or a new station on COM1; hover and click its ✕ to hide it.
- Added: ATC answering a wrong readback ("Negative, QNH 1013.") turns the pill red-orange with "Negative" and the correction.
- Added: hints for pushback, line up, go around, speeds, STARs, runway exits, "continue", "report ..." and "say ..." requests, "unable direct", and taxi to a ramp, gate or stand; "taxi via M, T" shows every taxiway.
- Added: with Auto Tune off, a "Contact" reminder until COM1 is on the station ATC handed you to.
- Added: a new ATIS letter shows for 6 s; an ATIS playing on COM1 shows "ATIS".
- Added: ATC calling you while COM1 is muted turns the pill red-orange.
- Added: hovering the pill shows two buttons that flip BeyondATC's Auto Tune and Auto Respond, like the toolbar's own switches.
- Added: optional PTT indicator, from your PTT button also bound to the sim's Toggle Speaker.
- Changed: "You" is now "Transmitting" while your readback or request plays; while you reply to a readback, "Transmitting" and "Processing" keep its hint.
- Changed: the settings card has two tabs, Display and Position, and closes on a click outside it.
- Changed: with the settings card open, the sample pill shows the effect of the last setting changed for 4 s.
- Fixed: the idle dot stayed visible in the sim's menus after a flight.
- Fixed: BeyondATC errors showed as raw JSON.
- Fixed: ATC broadcasts to all stations showed "ATC Generating" / "ATC Transmitting".
- Fixed: an ATIS on COM1 showed as "Traffic" or "Service".
- Fixed: radio changes showed while a flight was loading.

## 1.0.1 (2026-10-20)

- Fixed: the pill stretched across the whole screen at startup when BeyondATC wasn't running.

## 1.0.0 (2026-10-20)

- First release.
