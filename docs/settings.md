# BATC Overlay settings

## Opening the settings

In flight, click the pill to open its panel, then click the gear. To close the settings, click the ✕, the pill, or anywhere outside them.

While the settings are open, the pill shows a sample, so you can see its size and position. When you change something, the sample shows what that setting does for a few seconds.

Changes apply right away. They are saved in the sim and kept after a restart. **Reset** at the bottom puts every setting back to its default.

The settings have two tabs: **Display** and **Position**.

## Display

### Readback hints

Default: **on**, **Hint**.

When ATC waits for your readback or answer, the pill says "Awaiting readback" or "Awaiting response". This setting controls what the pill shows next to it:

| Choice | The pill shows | Example |
|---|---|---|
| None | the status only | Awaiting readback |
| Short | the clearance values | Awaiting readback · 30R · T1 |
| Hint | a short hint taken from ATC's words | Awaiting readback · Taxi via T1 · Hold short 12L |
| Boxes | the toolbar's clearance boxes under the status | Taxi to Runway 12L, SID KELA8L, Altitude FL060, Squawk 1000 |

Short and Boxes need BeyondATC's clearance boxes. When there are none, the pill falls back to the hint.

Turned off, the pill doesn't show that ATC is waiting for you, nor "Negative" or "Readback OK".

### Keep last clearance

Default: **off**.

After ATC takes your readback, the pill normally shows "Readback OK" and shrinks back to the dot. With this on, the clearance stays on the pill, dimmed, so you can glance at it later.

It goes away with the next instruction, a new station on COM1, or a click on its ✕ (hover the pill: the clipboard icon turns into ✕).

### Messages

Default: **All**.

What ATC says appears in boxes under the pill.

| Choice | Messages shown |
|---|---|
| Off | none. Your answers still open under the pill when you hover it. |
| Mine | your exchanges with ATC |
| All | yours, plus ATC talking to other aircraft (needs AI traffic on) |

An exchange's messages leave together a few seconds after it ends. The message ATC is waiting on has an amber outline. Hover it to see your answers.

### Radio changes

Default: **on**.

When COM1 or COM2 changes, the pill shows the new station and frequency for 3 seconds.

### Contact reminders

Default: **on**.

- **Contact:** with BeyondATC's Auto Tune off, after ATC says "contact Marseille Approach on 120.100", the pill shows that station until COM1 is on it. A "Tune" button under the message sets COM1 for you.
- **Check in:** on a new station, if you haven't announced yourself after 10 seconds, the pill shows "Check in". After a minute it turns red-orange: "Not checked in". This doesn't show when Auto Respond is on.

### ATIS changes

Default: **on**.

When the ATIS letter changes, the pill shows "ATIS · Z" for 6 seconds.

### Warn when COM1 muted

Default: **on**.

If ATC calls you while COM1 is muted, the pill turns red-orange, so you know to unmute. Turned off, it stays amber like any ATC call.

### PTT indicator

Default: **off**.

Shows "Transmitting" while you hold your push-to-talk button. It turns red-orange if you talk while ATC or other traffic is transmitting.

BeyondATC doesn't tell other add-ons when PTT is held, so it needs one extra step:

1. In the sim, go to **Controls > Communications > TOGGLE SPEAKER**.
2. Bind it to the same button you use for BeyondATC's PTT. Keep BeyondATC's own binding as it is.
3. Turn on **PTT indicator**.

### AI traffic

Default: **on**.

While other aircraft talk, the pill shows a neutral "Traffic" label, and their calls appear in the messages (with Messages on All) and in the Log. Turn it off to only see your own radio.

### Full station names

Default: **off**.

Off: "Ground", "Tower". On: "Montpellier Ground", "Montpellier Tower".

### Hide when BATC is off

Default: **off**.

Off: when BeyondATC isn't running, the pill shows "BATC offline". On: there is no pill at all until BeyondATC starts.

## Position

| Setting | Default | What it does |
|---|---|---|
| Corner | top right | which corner of the screen the pill sits in |
| Side offset | 24 | distance from the left or right edge |
| Edge offset | 86 | distance from the top or bottom edge |
| Size | 100% | 60% to 250% |

Offsets are in pixels at 1080p and scale with your resolution, so the pill stays in the same place at 1440p or 4K.

In the bottom corners, the messages, answers and panel open above the pill instead of below it. In the left corners, they line up on the left.

## Auto Tune and Auto Respond

These are BeyondATC's own switches, the same ones as in its toolbar. They are not overlay settings.

Hover the pill: two buttons appear beside it. The speech bubble is **Auto Respond** and the radio waves are **Auto Tune**. A lit button is on; a dimmed, struck-through one is off. Click one to switch it. The panel has the same two switches at the bottom.

- **Auto Tune:** BeyondATC sets COM1 itself after a handoff.
- **Auto Respond:** BeyondATC reads back and answers for you.

## For builders

Timings and other details that aren't in the settings live in `CONFIG` at the top of `src/html_ui/paul-batc-pill/pill.js`. For example, how long a radio change shows (`tuneMs`) or how long before "Check in" appears (`checkInMs`). Edit them, then rebuild with `python tools/build.py build`.
