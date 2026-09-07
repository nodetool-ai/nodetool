# Custom timeline animations

Motion written as JavaScript instead of picked from the preset catalog.

The body runs **once**, host-side, and returns keyframes. Those keyframes are
stored on the clip and compiled exactly like a preset's, so nothing evaluates
JavaScript at render time.

## Why baking rather than per-frame evaluation

Five surfaces sample animations: the WebGPU preview
(`PreviewCompositor.tsx`), the web export renderer (`TimelineRenderer.ts`), the
text rasterizer (`rasterClipFrames.ts`), and the headless compositor
(`packages/video-nodes/src/nodes/timeline/compositeRender.ts`). They share one
pure sampler in `packages/timeline`, and there is no JS sandbox in the browser —
QuickJS runs server-side only (`web/src/components/jsScript/runJsScript.ts`).

Evaluating a body per layer per frame would mean a second engine in the web
bundle, an async hop inside a loop that already has no headroom
(`docs/timeline-editor-performance-audit.md`, tier 2), and two implementations
to keep bit-identical. Baking gives up one thing — a script cannot react to
playback state — and buys identical output on every surface for free.

Sampling `f(t)` densely is what makes that equivalent: a body emits its function
at N points and the sampler interpolates, exact to the sampling resolution.

## The script contract

A body is a Code-node body. It reads `inputs` and returns its result through
`output()`:

```js
const samples = [];
for (let i = 0; i <= inputs.sampleCount; i++) {
  const t = i / inputs.sampleCount;
  samples.push({
    t,
    opacity: t,
    offsetY: (1 - t) * inputs.canvasHeight * 0.1,
  });
}
await output("samples", samples);
```

### Inputs

| Field | Meaning |
|---|---|
| `role` | `"in"`, `"out"`, `"emphasis"`, or `"loop"` |
| `durationMs` | The animation's own window length |
| `clipDurationMs` | The clip it sits on |
| `canvasWidth`, `canvasHeight` | Resolve a normalized distance to px, as a preset does |
| `params` | The animation's `params`, untouched |
| `staggerCount` | Stagger units the clip splits into (a text clip's word count), else 0 |
| `sampleCount` | Suggested density for a body sampling a continuous function |

### Outputs

Return exactly one of:

- **`samples`** — one bag per point in time, `{t, opacity, offsetY, …}`. A
  property must be set on every sample or none; a hole would make the sampler
  invent motion the body never wrote.
- **`curves`** — per-property keyframes, `{property, keyframes: [{t, value,
  easing?}]}`, for a body that authored them directly.

A body driving `wipeProgress` must also `output("mask", {direction, softness})`.
Direction and softness never animate, and defaulting them would render a wipe
nobody described.

### Animatable properties

`ANIMATED_PROPERTIES` in `packages/timeline/src/animation/types.ts` is the
list; `ANIMATED_PROPERTY_DOCS` in `animation/custom.ts` pairs each channel with
its fold, its identity value and its range, and is what
`list_animation_presets` prints. Transform: `offsetX`, `offsetY`, `scale`,
`scaleX`, `scaleY`, `rotation`, `positionX`, `positionY`, `anchorX`, `anchorY`.
Compositing: `opacity`, `wipeProgress`. Grade and blur: `blur`, `brightness`,
`saturation`, `contrast`, `hue`, `temperature`, `tint`. Shape stroke:
`trimStart`, `trimEnd`.

A channel folds one of four ways when several animations drive it: `add`,
`multiply`, `min` (`wipeProgress` — more hidden wins), or `replace` (the
absolute channels: position, anchor, trim).

## Two differences from a preset

**No time reversal for `"out"`.** A preset authors forward motion and the
compiler reverses it; a body is handed its `role` and writes the motion it
wants.

**Segments default to linear.** A preset's role easing on top of a densely
sampled `f(t)` would distort values the body already shaped. An explicit
`animation.easing`, or a per-keyframe `easing`, still wins.

## Storage

The animation carries `preset: "custom"` and a `custom` payload
(`clipAnimation` in `packages/protocol/src/api-schemas/timeline.ts`):

```jsonc
{
  "id": "anim-1",
  "role": "in",
  "preset": "custom",
  "durationMs": 600,
  "custom": {
    "scriptId": "js-script-row-id",   // or "code": "…" — provenance, never run at render time
    "bakedAt": "2026-09-01T12:00:00Z",
    "curves": [{ "property": "opacity", "keyframes": [{ "t": 0, "value": 0 }, { "t": 1, "value": 1 }] }]
  }
}
```

Limits, enforced at bake and again at compile: 16 curves per animation, 4096
keyframes per curve, one curve per property.

### Source-anchored curves

`custom.timeBase` picks the clock a curve's keyframes are placed on:
`"clip"` (the default) normalizes `t` over the animation window, the way a
preset does. `"source"` places every keyframe at an absolute `sourceMs`
instead — a time in the clip's own media — and the sampler evaluates the curve
at the clip's current source time (`clipSourceMsAt`, `timeRemap.ts`) rather
than at the window's `t`. That is the same time the compositor seeks the
clip's video to, so a speed change, an in-point trim, or a `timeRemap` moves
the animation exactly the way it moves the footage.

`bakedFrom` names what produced the curve when a hand edit did not — an audio
loudness bake, a motion tracker — as provenance to re-bake from (`kind`, and
optionally `clipId`, `assetId`, `settings`), never something rendered.

Because the curve is placed in the media, a trim or a split **re-slices** it
instead of letting the window stretch it (`animation/sourceCurves.ts`):
keyframes outside the retained source window are dropped, and an interpolated
keyframe is added at each new edge, so the motion at a timeline instant the
edit did not touch is unchanged. That is exact for a linear segment — the
compiler's default for a custom animation — and an approximation when a cut
lands inside an eased segment. A clip-based curve carries no `sourceMs` and is
left alone: stretching with the window is what its `t` means.

## Baking

`POST /api/timelines/animations/bake`, with `code` or `script_id` (a `js_scripts`
row), the role, the timings, and the canvas:

```bash
curl -sX POST localhost:7777/api/timelines/animations/bake \
  -H 'content-type: application/json' \
  -d '{"code":"await output(\"samples\",[{t:0,opacity:0},{t:1,opacity:1}]);",
       "role":"in","duration_ms":500,"clip_duration_ms":3000,
       "canvas":{"width":1920,"height":1080}}'
```

The response carries `curves` (and `mask`), the body's `logs`, and `error` when
the body failed — a body that throws is a result to show its author, not a 500.

The run is **hermetic**: no toolbelt, no secrets, no network, capped at 10s. A
curve generator is a function of time, and reach would let the same animation
bake differently depending on where it ran.

## The agent path

An agent writes a custom animation the way it writes any other: one
`animate_clip` op through `edit_timeline` (or `ui_timeline_animate_clip` in an
open editor), with `preset: "custom"` and **exactly one** of `curves` and
`code`.

```jsonc
{
  "op": "animate_clip",
  "target": "Title",
  "animations": [{
    "role": "in",
    "preset": "custom",
    "durationMs": 800,
    "curves": [{
      "property": "offsetY",
      "keyframes": [{ "t": 0, "value": 120 }, { "t": 1, "value": 0 }]
    }]
  }]
}
```

`curves` are the keyframes themselves — `t` runs 0..1 over the animation's
window, and a curve that stops short of either end is extended by holding its
end value. `code` is the body above: the host bakes it once through
`bakeCustomAnimation` — the same hermetic run the endpoint uses — and stores
`code` beside the curves as provenance. Both paths end at
`normalizeCustomCurves`, so what is stored is what will render.

Four rules the op enforces, each with the message that says how to fix it:

- Both `curves` and `code`, or neither, is refused. One says what the motion
  is; the other says what computes it.
- A property outside `ANIMATED_PROPERTIES` is refused, and the message lists
  the ones a curve may drive.
- A `wipeProgress` curve needs `mask` (`{direction, softness}`) — the same
  refusal the compiler and the validator raise.
- A machine-produced curve goes through `set_baked_animation`, not this op.
- `code` needs a host that can bake it. `edit_timeline` wires one; a surface
  with none says so and points at `curves` rather than storing an unbaked body.

Without `durationMs` the animation spans the clip, so hand-written curves need
no arithmetic to line up with a cut.

`list_animation_presets` reports the `custom` contract and every animatable
property with its fold, identity and range, so the channels can be read off the
tool rather than out of this document.

### A curve something measured

A bake is re-run — change the sensitivity, bake again — so it cannot use
`animate_clip`, whose `mode` is "append everything" or "replace everything".
`set_baked_animation` writes **one** source-anchored curve and carries its
provenance:

```jsonc
{
  "op": "set_baked_animation",
  "target": "Shot 3",
  "animation": {
    "property": "scale",
    "keyframes": [{ "sourceMs": 0, "value": 1 }, { "sourceMs": 1500, "value": 1.12 }],
    "timeBase": "source",
    "bakedFrom": { "kind": "audio", "clipId": "clip_music", "assetId": "asset_x" }
  }
}
```

`bakedFrom.kind` plus the driven property is the identity a re-bake matches: a
second write of the same kind on the same property replaces that animation in
place, keeping its id, and `replace: false` appends beside it instead. An
animation with no `bakedFrom` — anything a person keyframed — never matches and
is never overwritten. `role` defaults to `emphasis` over the whole clip, and
`bakedAt` is not stamped: `bakedFrom` is this path's provenance, and a
wall-clock field would make two hosts running the same bake write two different
documents.

`bake_audio_animation` is the producer that exists today. It measures an audio
clip's own stretch of its file, turns loudness (`mode: "envelope"`) or onsets
(`mode: "beats"`) into keyframes, maps each one from audio-source time through
timeline time into the target clip's source time, and applies the op. It
refuses a time-remapped clip on either end, because a remap makes "which source
millisecond plays here" a curve over the clip's window with no inverse to map a
beat through.

## Checks

`nodetool timeline validate` and the `validate_timeline` tool report
`custom_animation_invalid` for curves the compiler would skip (an unknown
property, a keyframe with no finite value, a `wipeProgress` curve with no mask)
Curves that are absent or empty are reported by that same code — an animation
that drives nothing. Inline curves need no script or code behind them: under
the agent path they are the source, not a bake of one.

## Code

| Piece | Where |
|---|---|
| Contract, normalization, limits (pure) | `packages/timeline/src/animation/custom.ts` |
| Compiler path | `packages/timeline/src/animation/compile.ts` |
| Wire schema | `packages/protocol/src/api-schemas/timeline.ts` |
| Bake (the one place the body runs) | `packages/agents/src/custom-animation-bake.ts` |
| HTTP surface | `packages/websocket/src/routes/timeline-animations.ts` |
| Agent op (one bridge, both surfaces) | `packages/agents/src/evals/surfaces/timeline.ts` |
| Baked-curve write and its replace rule (pure) | `packages/timeline/src/animation/bakedAnimation.ts` |
| Audio bake: the three clocks and the two curve shapes | `packages/agents/src/capabilities/timeline-audio-bake.ts` |
| Validation | `packages/execution/src/timeline-debug/validate.ts` |

## Not built yet

No editor UI. Outside the agent path above, a custom animation is authored
through the bake endpoint and written onto the clip by whatever holds the
document — the CLI, or a client calling the route directly.
