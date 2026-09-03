---
name: motion-curves
description: Write custom timeline animations — keyframe curves by hand, or a JavaScript body baked into curves once in the sandbox — for motion no preset covers. Use for overshoot, decaying bounce, anticipation, wiggle, inertia, arcs, path draw-on, or any move whose shape a preset plus an easing cannot express. Covers the code contract, the animatable channels and how several curves combine.
---

# Motion Curves → animation nobody had a preset for

`{"preset": "custom"}` carries exactly one of `curves` (keyframes you write) or
`code` (a JS body baked into curves once, host-side). Add `mask` when a curve
drives `wipeProgress`.

`motion-graphics` carries the op contract and the preset catalog this file is
the escape hatch from. `motion-principles` gives the duration and the shape a
curve should hit before you write its keyframes.

## When to write one

Write curves as soon as a preset is close but not right. The catalog is seven
entrance shapes and a handful of beats — where motion starts, not where it
stops — and a piece whose every title arrives with `pop` reads like a template.
A curve costs one field and a few numbers, and the recipes below are the shapes
worth reaching for: an entrance that overshoots twice, a hold in the middle of a
move, two channels on different schedules, a decay, an arc, a wiggle, a path
draw-on.

Two shapes need no curve, and writing one anyway only makes the document harder
to read: a single overshoot and a physical settle are already `easing` strings.
`cubic-bezier(0.16,1,0.3,1)` and `spring(180,12,1)` on an ordinary preset do
both. Everything past that is this file.

## Curves by hand

```json
{"op": "animate_clip", "target": "Title", "animations": [
  {"role": "in", "preset": "custom", "durationMs": 600,
   "curves": [
     {"property": "offsetY", "keyframes": [
       {"t": 0, "value": 80}, {"t": 0.7, "value": -12, "easing": "easeOut"},
       {"t": 1, "value": 0, "easing": "easeInOut"}]},
     {"property": "opacity", "keyframes": [
       {"t": 0, "value": 0}, {"t": 0.4, "value": 1}]}]}]}
```

`t` runs 0..1 over the animation's **window**, not the clip. `easing` on a
keyframe eases the segment **ending** there. Keyframes are sorted, `t` is clamped
to 0..1, and a curve that stops short of either end is extended by holding its
end value — so sampling 0.05..0.95 does what it looks like.

Limits: 16 curves per animation, one per property, 4096 keyframes each.

`durationMs` defaults to the clip's own duration, so curves span the whole clip
unless you say otherwise.

## The channels, and how they combine

Several animations can drive one channel. How they fold decides whether the
second adds to the first or throws it away.

| Fold | Channels | Identity | Result |
|---|---|---|---|
| add | `offsetX`, `offsetY`, `rotation` (radians), `blur` (px), `brightness` (−1..1), `hue` (deg), `temperature`, `tint` | 0 | Values sum |
| multiply | `scale`, `scaleX`, `scaleY`, `opacity` (0..1), `saturation` (0..4), `contrast` (0..4) | 1 | Values multiply |
| min | `wipeProgress` (0..1) | 1 | The tightest wipe wins |
| replace | `positionX`, `positionY` (canvas px), `anchorX`, `anchorY` (0..1), `trimStart`, `trimEnd` (0..1) | none | The last animation in document order wins; the other is discarded |

The replace row is the trap. Two animations driving `positionX` over the same
instants means one does nothing, reported as `replace_curves_overlap`. Move a
clip with `offsetX` when it should compose with other motion, and with
`positionX` only for an absolute placement nothing else touches.

Land the last keyframe on the identity value unless you mean the clip to stay
where the curve stopped — and remember the role decides whether it stays: an
`in` window holds its `t: 0` values before it and contributes nothing after, an
`out` window holds its `t: 1` values after it, `emphasis` holds neither, and
`loop` repeats its cycle, so a loop curve must end on the value it started on.

`list_animation_presets` reports this table from the engine. Read it there rather
than from memory when a channel's range matters.

## The code body

A JavaScript body run **once**, at author time, in the QuickJS sandbox. It
returns keyframes; the keyframes are stored on the clip; every renderer samples
those. Nothing evaluates per frame, which is why a body cannot react to playback
and why the same animation looks identical in the preview, the export and the
headless compositor.

The bake is hermetic: no toolbelt, no `nodetool.*`, no network, no secrets. Just
arithmetic, a 10-second ceiling, and `inputs`:

| `inputs` field | What it is |
|---|---|
| `role` | `in`, `out`, `emphasis` or `loop` |
| `durationMs` | The animation's own window |
| `clipDurationMs` | The clip it sits on |
| `canvasWidth`, `canvasHeight` | Sequence pixels — turn a normalized distance into px here |
| `params` | The animation's `params`, untouched |
| `staggerCount` | Units a text clip splits into, or 0 |
| `sampleCount` | Suggested density for a continuous function |

Return `{curves}` — the same shape as the JSON above — or `{samples}`, one bag
per point in time:

```js
const n = inputs.sampleCount;
const samples = [];
for (let i = 0; i < n; i++) {
  const t = i / (n - 1);
  samples.push({ t, offsetY: ..., opacity: ... });
}
return { samples };
```

Returning both is an error, as is returning neither. A property present on some
samples and absent from others is an error rather than a hole — interpolating
across the gap would invent motion nobody wrote. A sample needs a finite numeric
`t`; `easing` on a sample is optional and applies to the segment ending there.
At most 4096 samples.

Because the bake runs once, a body using `Math.random` is frozen at the value it
drew: the result is stable forever after, but re-baking gives different motion.
Seed your own generator when the same body has to produce the same wiggle twice.

## Recipes

**Overshoot and settle.** Two overshoots, the second smaller — what a single
`easeOutBack` cannot express.

```js
const p = [[0, 0.6], [0.45, 1.09], [0.68, 0.97], [0.85, 1.02], [1, 1]];
return { curves: [{ property: "scale",
  keyframes: p.map(([t, value]) => ({ t, value, easing: "easeInOut" })) }] };
```

**Decaying bounce.** Hops that die out and land exactly at rest.

```js
const n = inputs.sampleCount, h = 0.06 * inputs.canvasHeight, hops = 3;
const samples = [];
for (let i = 0; i < n; i++) {
  const t = i / (n - 1);
  samples.push({ t, offsetY: -h * Math.abs(Math.sin(Math.PI * hops * t)) * (1 - t) });
}
return { samples };
```

**Anticipation.** A counter-move before the action, 60–120ms of the window.

```js
return { curves: [{ property: "offsetY", keyframes: [
  { t: 0, value: 0 }, { t: 0.18, value: 10, easing: "easeInOut" },
  { t: 0.8, value: -4, easing: "easeOut" }, { t: 1, value: 0 }] }] };
```

**Wiggle.** Deterministic noise, the sandbox answer to a wiggle expression. A
seeded generator so a re-bake reproduces it.

```js
const n = inputs.sampleCount;
const amp = Number(inputs.params.amplitude ?? 6);
let seed = Number(inputs.params.seed ?? 1);
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5;
const samples = [];
for (let i = 0; i < n; i++) {
  const t = i / (n - 1);
  const fade = Math.min(1, 4 * t, 4 * (1 - t));   // rest at both ends
  samples.push({ t, offsetX: rand() * amp * fade, offsetY: rand() * amp * fade });
}
return { samples };
```

**Inertia.** A trailing part that lags the body and catches up — follow-through
without a second clip.

```js
const n = inputs.sampleCount, lag = 0.12;
const ease = (t) => 1 - Math.pow(1 - t, 3);
const samples = [];
for (let i = 0; i < n; i++) {
  const t = i / (n - 1);
  const behind = ease(Math.max(0, t - lag) / (1 - lag));
  samples.push({ t, offsetX: (1 - behind) * -0.1 * inputs.canvasWidth });
}
return { samples };
```

**Arc.** Straight-line travel looks mechanical. Drive one axis linearly and the
other as a shallow parabola over the same window; both fold as `add`.

```js
const n = inputs.sampleCount;
const dx = 0.25 * inputs.canvasWidth, rise = 0.06 * inputs.canvasHeight;
const samples = [];
for (let i = 0; i < n; i++) {
  const t = i / (n - 1);
  samples.push({ t, offsetX: -dx * (1 - t), offsetY: -rise * 4 * t * (1 - t) });
}
return { samples };
```

**Pendulum.** A decaying rotation, in radians.

```js
const n = inputs.sampleCount, a = 0.12, cycles = 2.5;
const samples = [];
for (let i = 0; i < n; i++) {
  const t = i / (n - 1);
  samples.push({ t, rotation: a * Math.cos(2 * Math.PI * cycles * t) * (1 - t) });
}
return { samples };
```

**Seamless loop.** Any `loop` curve must return to its start, so build it from a
whole number of cycles of a periodic function.

```js
const n = inputs.sampleCount, amp = 0.02 * inputs.canvasHeight;
const samples = [];
for (let i = 0; i < n; i++) {
  const t = i / (n - 1);
  samples.push({ t, offsetY: -amp * Math.sin(2 * Math.PI * t) });
}
return { samples };
```

**Path draw-on.** `trimEnd` 0 to 1 on a `path` shape clip. Both trim channels
fold as `replace`, so one animation drives each and their windows must not
overlap.

```js
return { curves: [{ property: "trimEnd",
  keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1, easing: "easeInOut" }] }] };
```

**Wipe with a shaped edge.** A `wipeProgress` curve needs the mask on the same
animation, because direction and softness cannot be inferred:

```json
{"role": "in", "preset": "custom", "durationMs": 700,
 "mask": {"direction": "left", "softness": 0.1},
 "curves": [{"property": "wipeProgress", "keyframes": [
   {"t": 0, "value": 0}, {"t": 0.6, "value": 0.8, "easing": "easeOut"},
   {"t": 1, "value": 1}]}]}
```

## Failure modes

- A body returning nothing, or both shapes, fails the bake with the reason. Read
  it: the bake returns the error and the body's logs rather than throwing.
- A property name outside the channel list fails the bake and names the ones it
  will take.
- A curve driving `wipeProgress` with no `mask` is refused.
- An easing string the grammar cannot read eases linearly and shows up as
  `unknown_easing` on `validate_timeline`. It is `easeOut`, not `ease-out`.
- A window that does not fit the clip after its delay is `animation_exceeds_clip`
  — the motion is clamped or never runs.
- A runaway loop hits the 10-second ceiling. A curve generator is arithmetic over
  a few hundred points; if it is slow, it is wrong.

## Check the shape you wrote

Curves are the one place where reading the numbers is not enough. Use
`preview_timeline_frame` with a `range` across the animation's window and
`sheet: true`, which tiles the sweep into one labelled contact sheet — the way
to watch an overshoot actually overshoot rather than checking three instants
that all happen to look right.
