# BATC Overlay settings

Click the pill, then the gear in its panel. While the settings are open, the pill shows a sample of your last change. Settings survive a sim restart.

## Display

| Setting | Default | Notes |
|---|---|---|
| Readback hints | on, Hint | see below. Off also hides "Negative" and "Readback OK" |
| Keep last clearance | off | after your readback, the clearance stays on the pill, dimmed, until the next instruction, a new station on COM1, or its ✕ |
| Messages | All | Mine: your exchanges only. All: other aircraft too (needs AI traffic) |
| Radio changes | on | new station on COM1 or COM2, for 3 s |
| Contact reminders | on | with Auto Tune off, the station you were handed to until COM1 is on it. Also "Check in" after 10 s on a new station without announcing yourself (not with Auto Respond) |
| ATIS changes | on | new ATIS letter, for 6 s |
| Warn when COM1 muted | on | red-orange pill when ATC calls on a muted COM1 |
| PTT indicator | off | needs a second binding, see below |
| AI traffic | on | other aircraft's calls on the pill, in the messages and in the Log |
| Full station names | off | "Montpellier Ground" instead of "Ground" |
| Hide when BATC is off | off | no "BATC offline" pill |

### Readback hints

| Choice | Example |
|---|---|
| None | Awaiting readback |
| Short | Awaiting readback · 30R · T1 |
| Hint | Awaiting readback · Taxi via T1 · Hold short 12L |
| Boxes | the toolbar's clearance boxes under the status |

Short and Boxes fall back to Hint when BeyondATC sends no clearance boxes.

### PTT indicator

BeyondATC doesn't share its PTT state. Bind your PTT button a second time to **Controls > Communications > TOGGLE SPEAKER**, keeping BeyondATC's binding, then turn the setting on. The pill turns red-orange if you talk over ATC or other traffic.

## Position

Corner, side and edge offsets (in 1080p pixels, scaled to your resolution) and size (60% to 250%). In the bottom corners everything opens above the pill; in the left corners it lines up on the left.

## Not in the settings

- **Auto Tune / Auto Respond** are BeyondATC's own switches: hover the pill (speech bubble, radio waves) or use the panel.
- Timings (`tuneMs`, `checkInMs`, ...) are in `CONFIG` at the top of `pill.js`. Rebuild after editing.
