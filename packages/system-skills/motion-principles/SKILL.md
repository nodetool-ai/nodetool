---
name: motion-principles
description: Decide how something should move before you animate it — durations, easing curves, stagger offsets, weight, anticipation and follow-through, given as numbers ready to paste into a NodeTool timeline animation. Use when motion feels stiff, floaty, robotic or cheap, when picking a duration or an easing for an entrance, exit or transition, or when reviewing whether a cut's motion reads. Not for the tool contract — that is motion-graphics.
---

# Motion Principles → the numbers before the call

`motion-graphics` is how to write an animation onto a clip. This is how to
decide what to write. Every number here is in the units `animate_clip` takes:
milliseconds, a normalized 0..1 distance, an easing string.

## Settle three things before picking a number

| Pillar | The question | What it decides |
|---|---|---|
| Emotional intent | What should the viewer feel? | Easing, duration, overshoot |
| Visual narrative | Setup, action, resolution — what enters when? | Sequencing, `delayMs`, stagger |
| Motion craft | Why does it look believable? | Anticipation, follow-through, arcs |

A number chosen before the intent is a number you will change twice.

## Three layers, or the frame reads flat

Believable motion runs three at once, and each maps onto a track index:

- **Primary** — the one move the eye follows. The clip the shot is about.
- **Secondary** — supporting motion reacting to the primary: a scrim settling
  late, a label arriving 80ms after the plate.
- **Ambient** — background life that never asks for attention. A `loop` preset
  at low amplitude on the bed.

`motion-direction` ranks the same three as Hero / Support / Texture and decides
which elements earn each. Two clips carrying primary motion at once is the most
common cause of a busy frame.

## Easing is the biggest lever

`linear` reads as robotic. Keep it for motion that never lands: the `loop`
presets `float`, `rotate` and `hueShift`, and the `shake` emphasis, whose
zig-zag is linear by default. Everything the eye reads as an event decelerates
into rest.

| Action | Easing | Why |
|---|---|---|
| Entrance (`in`) | `easeOut`, or `cubic-bezier(0.16,1,0.3,1)` for a sharper landing | Arrives with energy, settles |
| Exit (`out`) | `easeIn`, or `cubic-bezier(0.7,0,0.84,0)` | Accelerates away |
| A move that stays on screen | `easeInOut`, or `cubic-bezier(0.65,0,0.35,1)` | Symmetric, no false weight |
| Playful landing | `easeOutBack`, or `cubic-bezier(0.34,1.56,0.64,1)` | The value past 1 is the overshoot |
| Physical settle | `spring(180,12,1)` one overshoot, `spring(180,26,1)` none | Solves a real spring; all three constants positive |

The role defaults already do the right thing: `in` gets `easeOut`, `out` gets
`easeIn`. Leave `easing` unset unless you want something the default is not.
A string the parser cannot read eases linearly and reports `unknown_easing` —
`easeOut`, never `ease-out`.

Overshoot reads as toy-like. Keep `easeOutBack`, `easeOutElastic` and
`easeOutBounce` off anything financial, medical or corporate.

## Duration carries weight

| Element | `durationMs` |
|---|---|
| Micro beat: a `flash`, a `pulse` on a small element | 150–250 |
| Title, lower third, overlay entrance | 300–500 |
| Hero element, full-frame plate, a `blur` rack | 500–800 |
| Camera move: `kenBurns`, a slow push | 1500–4000 |

Distance and area scale it. A caption travelling `distance: 0.05` and a
full-bleed plate travelling `0.5` must not share 400ms — the plate looks
weightless. Add roughly 30–50% when the travel or the area doubles.

Two limits the engine enforces rather than warns about in prose:

- `in` + `out` must fit the clip with hold left over. A 3000ms title with 500ms
  each way holds 2000ms. Under about 1000ms of hold the element never settles
  and reads as a glitch. Over-long windows report `animation_exceeds_clip`.
- A `loop` cycle longer than the clip shows a fragment. `kenBurns` at its 3000ms
  default on a 2000ms clip is a drift that stops halfway.

## Stagger is rhythm, and it is clamped

Never reveal a group in one event. On a text clip, `stagger` splits the
animation per word, grapheme or wrapped line.

| Content | `offsetMs` |
|---|---|
| A phrase that should arrive with texture | 60–100 |
| A short punchline landing word by word | 150–250 |
| More than five words | do not stagger — the reader is waiting on the sentence |

The span is `durationMs + offsetMs × (units − 1)`, halved for `from: "center"`.
Work it out and compare it against the clip's `durationMs` minus `delayMs`. A
span that does not fit is **compressed silently**: the engine shrinks the offset,
never the per-unit duration, so the line lands flatter than written and only
`validate_timeline` says so, as `stagger_compressed`.

For a group of separate clips — three lower-third parts, five icons — stagger by
giving each clip's `in` animation a `delayMs` 60–80ms apart, and cap the whole
reveal near 700ms. Past that the tail drags.

## The 1/3 rule, in both forms

- **Distance.** Nothing travels more than about a third of the frame in one
  unbroken move. `slide` with `distance` above 0.35 reads as "the template
  moved". Break it with a scale or opacity change on the same window, or shorten
  the travel.
- **Simultaneity.** With three or more elements, keep at most a third in active
  motion at any instant. The rest hold, or run ambient loops.

## Anticipation, follow-through, arcs

The three that separate animated from moved. None has a preset; each is a
`custom` animation, which is where a short `code` body earns its place.

**Anticipation** — a counter-move of 60–120ms before the main action. Ask for a
dip before a pop:

```json
{"role": "in", "preset": "custom", "durationMs": 520,
 "curves": [{"property": "scale", "keyframes": [
   {"t": 0, "value": 1}, {"t": 0.2, "value": 0.94, "easing": "easeInOut"},
   {"t": 0.75, "value": 1.06, "easing": "easeOut"}, {"t": 1, "value": 1}]}]}
```

**Follow-through** — attached parts settle 40–80ms after the body. Give the
child clip the same preset and a `delayMs` 60ms later, rather than animating the
whole group as one block.

**Arcs** — straight-line translation of anything organic looks mechanical. Drive
`offsetX` linearly and `offsetY` as a shallow curve over the same window; the
two fold as `add`, so they compose.

A decaying bounce, an arc, or a settle written as a function of time is a `code`
body returning `samples` — one bag per point, `{t, offsetY}`, at
`inputs.sampleCount` points. The body runs once at author time, hermetically, and
reads `role`, `durationMs`, `clipDurationMs`, `canvasWidth`, `canvasHeight`,
`params`, `staggerCount` and `sampleCount` off `inputs`:

```js
const n = inputs.sampleCount;
const h = 0.06 * inputs.canvasHeight;
const samples = [];
for (let i = 0; i < n; i++) {
  const t = i / (n - 1);
  // three decaying hops, ending exactly at rest
  const y = -h * Math.abs(Math.sin(Math.PI * 3 * t)) * (1 - t);
  samples.push({ t, offsetY: y });
}
return { samples };
```

Land the last sample on the identity value — 0 for an offset, 1 for a scale or
an opacity — or the clip holds at whatever the curve stopped on.

## Rhythm against audio

Land impact keyframes on the beat, never between. At 120 BPM a beat is 500ms and
the eighth grid is 250ms. `beat-sync-editing` turns detected onsets into the
markers and snaps; this is only the rule that a move ending 80ms after the hit
reads as late, and one ending 80ms early reads as wrong.

With no music, keep one major event per 500–800ms so the piece breathes at a
constant pulse.

## Spring or duration

`spring(stiffness,damping,mass)` self-determines its settle and reads as
physical. Use it on one element landing. Use a duration and a curve for anything
that must hit a timecode — a title over a cut, a stagger inside a fixed clip —
because the spring's tail is not something you can time to a frame.

## Diagnosing

| It feels | Because | Fix |
|---|---|---|
| Stiff, robotic | `linear` or a symmetric curve on an entrance | `easeOut`, or drop `easing` and take the role default |
| Floaty, slow | Duration too long, curve too gentle | Cut 30%, sharpen to `cubic-bezier(0.16,1,0.3,1)` |
| Cheap, janky | Everything arrives at once, one duration for every size | Stagger, and scale duration with area |
| Mechanical despite easing | No anticipation, no overlap, straight-line paths | A `custom` dip before the move; 60ms offsets on attached parts |
| Busy | Two primary moves in one frame | Demote one to a loop or hold it still |
| Staggered text does not look staggered | Span exceeded the clip and was compressed | Lengthen the clip or lower `offsetMs` yourself |

## Quick reference

| Need | Value |
|---|---|
| Entrance | `easeOut` / `cubic-bezier(0.16,1,0.3,1)`, 300–500ms |
| Exit | `easeIn` / `cubic-bezier(0.7,0,0.84,0)`, 200–300ms |
| Move in place | `easeInOut`, 300–400ms |
| Playful landing | `easeOutBack`, 400–600ms |
| Word stagger | 60–100ms, five words or fewer |
| Clip-to-clip stagger | 60–80ms `delayMs` steps, whole reveal ≤ 700ms |
| Loop only | `linear` |
| Travel cap | `distance` ≤ 0.35 without a second channel |
