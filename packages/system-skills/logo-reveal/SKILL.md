---
name: logo-reveal
description: Animate a brand mark on a NodeTool timeline — stroke draw-on, mask wipe, staggered build, wordmark type, an idle loop, and landing the settle on a sound logo. Use for an intro sting, a sign-off, an end card, a splash, or a loader loop. Not for designing the mark itself.
---

# Logo Reveal → the sting

One idea per logo. Draw it, build it, or wipe it — never all three. The whole
reveal runs 800–2500ms and ends on the clean mark, held.

`motion-graphics` carries the op contract. `motion-direction` decides which
personality the sting belongs to; a logo is usually the one place a piece is
allowed its overshoot.

## Pick one technique

| Technique | Best for | How, on the timeline |
|---|---|---|
| Stroke draw-on | Line marks, monograms, signatures | A `path` shape clip, `trimStart`/`trimEnd` animated |
| Mask wipe | Filled shapes, gradient marks | `wipe` preset, or a `set_mask` rect animated |
| Build-on | Multi-part marks, grids | One clip per part, in a group, `delayMs` staggered |
| Wordmark | Logotypes | A text clip with a per-character or per-word `stagger` |
| Idle loop | Loaders, ambient splash | `breathe` or `rotate` as a `loop` |
| Scale settle | Anything, when in doubt | `pop` with a small `overshoot` |

## Stroke draw-on

`trimStart` and `trimEnd` stroke only a sub-range of a path, 0..1. Drawing is
`trimEnd` running 0 to 1 with the stroke visible and the fill arriving after:

```json
{"op": "add_shape_clip", "shape": {"kind": "path", "d": "M0.1 0.7 L0.3 0.2 L0.5 0.7",
 "stroke": "#111111", "strokeWidthPx": 6, "lineCap": "round",
 "trimStart": 0, "trimEnd": 0}, "durationMs": 2000}
```

```json
{"op": "animate_clip", "target": "Path", "animations": [
  {"role": "in", "preset": "custom", "durationMs": 1100,
   "easing": "cubic-bezier(0.65,0,0.35,1)",
   "curves": [{"property": "trimEnd", "keyframes": [
     {"t": 0, "value": 0}, {"t": 1, "value": 1}]}]}]}
```

Both trim channels fold as **replace**: one animation drives one of them, and two
overlapping in time means the later wins and the earlier is discarded, reported
as `replace_curves_overlap`. Draw with `trimEnd` alone; use `trimStart` chasing
it only for a stroke that draws and erases, and put the two in separate windows.

Stagger several strokes by giving each path clip's animation a `delayMs`
100–200ms apart, in the order a hand would draw them.

A `d` the renderer cannot parse is refused at the call rather than stored, and an
unknown `kind` reports `unknown_shape_kind` and draws nothing — a mark that
vanished is usually one of those two.

## Mask wipe

For a filled mark, reveal rather than draw. `{"role": "in", "preset": "wipe",
"durationMs": 700, "params": {"direction": "left", "softness": 0.05}}` sweeps a
feathered edge across the layer. `softness` 0 is a hard edge, which reads as
graphic; 0.1 reads as light passing over.

A `custom` curve driving `wipeProgress` needs a `mask` on the same animation —
`{direction, softness}` — because a wipe with no edge to run against cannot be
inferred. `wipeProgress` folds as **min**, so two wipes on one layer keep the
tighter one.

## Build-on

One clip per part, each on its own overlay track, all parented to one group with
`add_group`. Reveal the container first, then accents, then the wordmark last so
the eye lands on the name.

```json
{"op": "animate_clip", "target": "Mark part 2", "animations": [
  {"role": "in", "preset": "pop", "durationMs": 500, "delayMs": 160,
   "params": {"overshoot": 1.12}}]}
```

Steps of 80–120ms. Then animate the **group** for anything that moves the whole
assembly — one `fade` out on the group beats three chances for the parts to
drift apart. The group's opacity multiplies into each child.

## Wordmark

A text clip with a stagger. Per character for a short mark, per word for a
lockup with a tagline:

```json
{"role": "in", "preset": "pop", "durationMs": 380,
 "stagger": {"unit": "character", "offsetMs": 45, "from": "start"}}
```

Work the span out — `durationMs + offsetMs × (units − 1)` — and compare it
against the clip. A span that does not fit is compressed silently, and a
compressed wordmark is the reason a reveal "does not look staggered".
`stagger_compressed` is the warning.

Set the family to a bundled one — `Inter`, `Space Grotesk`, `Bebas Neue`,
`Playfair Display`, `Lora`, `JetBrains Mono` — or the render and the editor
resolve it differently and the lockup's width changes under you.

## What not to do to a mark

Scale, opacity, rotation about the mark's own anchor, and position are safe.
`scaleX` and `scaleY` on their own are not: `squash` distorts the geometry, and a
distorted logo is a brand problem rather than a taste one. Keep motion out of the
clearspace — a support element sliding through the mark's margin cheapens it.

## Landing on a sound logo

Decide the audio first. A sound logo that does not exist yet is a 1–3 s
effects brief — source, action, space — on ElevenLabs sound effects
(`elevenlabs-audio-prompting`) or a `TrackType: SFX` prompt on Stable Audio
(`stable-audio-prompting`); a 30-second request for a hit is a hit followed by
room tone. Then `detect_audio_events` on the sting reports `onsets.times` in
**seconds**; multiply by 1000. Time the reveal so the mark reaches full opacity
and scale on that millisecond:

`delayMs` on the `in` animation = onset ms − the clip's `startMs` −
`durationMs`. Then add the accent on the hit itself, as a separate emphasis:
`{"role": "emphasis", "preset": "pulse", "durationMs": 220, "delayMs": <onset −
startMs>, "params": {"intensity": 0.04}}`.

A settle that floats free of the sound reads as cheap even when both are good.
`snap_to_beats` is the blunt version when the whole end card has to sit on the
grid.

## Idle loop

For a loader or a splash that waits, a `loop` at low amplitude: `breathe` with
`intensity` 0.02–0.04, or `rotate` on a mark that is radially symmetric. Set
`durationMs` to the cycle, 2000–4000ms, and remember a cycle longer than the clip
shows a fragment of the motion.

Never loop a wordmark somebody is reading.

## Hold the end frame

The last thing on screen is the static mark. Leave at least 800ms after the
reveal completes with nothing animating — an end card that cuts the instant it
settles reads as a mistake. On a 2500ms clip with a 1100ms draw and a 220ms
accent, that is satisfied; check it rather than assuming.

## Check it

- `validate_timeline`: `replace_curves_overlap` on the trims, `stagger_compressed`
  on the wordmark, `animation_exceeds_clip` on a reveal longer than its clip,
  `unknown_shape_kind` on a mark that draws nothing.
- `preview_timeline_frame` at the midpoint of the draw, a held moment, and the
  last frame. The midpoint is where a half-drawn path or a stroke that never
  closes shows up; the last frame is where you confirm the mark is clean and
  complete.
- Then `render_timeline`, because a sting is judged at speed.
