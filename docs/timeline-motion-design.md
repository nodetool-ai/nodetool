# Timeline motion design

This guide describes the timeline document fields available to composition
authors. These are document examples. The editor does not expose controls for
every field. The protocol schema and renderer are the source of truth when a
field is absent here.

## Easing and animation

Animation easing accepts named curves, `cubic-bezier(x1,y1,x2,y2)`, and
`spring(stiffness,damping,mass)`. Named curves include `linear`, `easeIn`,
`easeOut`, `easeInOut`, `easeOutBack`, `easeOutElastic`, `easeOutBounce`,
`easeInExpo`, `easeOutExpo`, `easeInOutExpo`, `easeInQuint`, `easeOutQuint`,
`easeInOutQuint`, `easeInCirc`, `easeOutCirc`, `easeInOutCirc`, and `hold`.
Unknown easing strings resolve to linear. Easing may be set on an animation or
on an individual keyframe segment.

```json
{
  "role": "in",
  "preset": "slide",
  "durationMs": 700,
  "easing": "cubic-bezier(0.16,1,0.3,1)",
  "params": { "direction": "up", "distance": 0.12 }
}
```

`spring(...)` is an easing curve for an authored animation segment, not a
physical simulation that responds to changing forces. The animation engine's
numeric curves drive transform, opacity, blur, grade, wipe, shape trim, and 3D
model camera channels. For arbitrary visual properties use `styleTracks`:

```json
{
  "role": "in",
  "preset": "fade",
  "durationMs": 600,
  "styleTracks": [
    { "target": "text.color", "keyframes": [
      { "t": 0, "value": "#8bd5ff" },
      { "t": 1, "value": "#ffffff", "easing": "easeOutExpo" }
    ] },
    { "target": "effect.glow-1.intensity", "keyframes": [
      { "t": 0, "value": 0 }, { "t": 1, "value": 1.2 }
    ] },
    { "target": "effect.bg-field.colorB", "keyframes": [
      { "t": 0, "value": "#1e1b4b" }, { "t": 1, "value": "#0f3b3a" }
    ] }
  ]
}
```

Targets include supported numeric shape and text style fields, including font
size, weight, and spacing, shape/text colors, gradient fill angles and stop
values, `effect.<effect-id>.<numeric-field>`, supported effect color fields,
mask bounds and feather, compatible `shape.d` / `mask.d` SVG paths,
`clip.borderRadius`, `mask.radiusPx`, and per-glyph color, blur, or tracking.
Color keyframes accept the CSS colors supported by the shared parser, including
named colors, hex, RGB, and HSL. A clip must have the matching style,
mask, or effect. Path morph endpoints must have the same SVG command and point
count structure. Glyph tracks require a text stagger. Links are the supported
cross-property mechanism. Arbitrary expressions are not evaluated at render time.
Effect color targets are `generator.colorA`, `generator.colorB`, and `color`
on `dropShadow`, `chromaKey`, or the color-using `stylize` modes (`lightRays`,
`lensFlare`, `innerShadow`, `innerGlow`, `edgeHighlight`, and
`lightLeakOverlay`), addressed through each effect's ID. The targeted color
field must already be present. String fields such as an effect's `mode` and
the currently unused `glow.color` cannot be animated by a style track.

Text content can count or decode over the animation window:

```json
{
  "role": "in", "preset": "fade", "durationMs": 900,
  "textAnimator": { "kind": "ticker", "from": 0, "to": 2847,
    "groupSeparator": "," }
}
```

Ticker also accepts `decimals`, `padTo`, `prefix`, and `suffix`.
`groupSeparator` inserts the given 1–4 character string between groups of
three integer digits, after zero padding. Without it, existing tickers remain
ungrouped. A deterministic scramble can be authored with
`{"kind":"scramble","charset":"ABC123","seed":17}`. Both operate on a
text clip's content during the animation. Per-unit transform and opacity
animation supports character, word, or wrapped-line stagger, with order
`start`, `end`, or `center`:

```json
"stagger": { "unit": "word", "offsetMs": 90, "from": "center" }
```

Unknown stagger units fall back to block animation. Existing text path support
sets `textStyle.path` to an SVG path in normalized canvas coordinates. The text
baseline follows that path. It is not a new per-character motion-path
animator. The `followPath` animation preset moves a clip along its authored
path parameters.

An animation can start on a beat by storing `beat` on the animation. `index`
is one-based. `scope: "clip"` counts from the clip start. `scope: "sequence"`
counts from the sequence tempo's `offsetMs`. `offsetMs` shifts the selected
beat, and `delayMs` remains an additional animation delay. Beat spacing uses
the sequence BPM (or the default tempo if none is set).

```json
{
  "role": "emphasis", "preset": "pop", "durationMs": 240,
  "beat": { "index": 3, "scope": "clip", "offsetMs": -20 }
}
```

To stagger selected clips in a visual order without moving their media, call
`ui_timeline_stagger_animations` with:

```json
{
  "clip_ids": ["logo", "wordmark", "tagline"],
  "offset_ms": 120
}
```

List clip IDs, not names. Every selected clip must already have an animation.
The first listed clip keeps its animation delays. Each later clip adds its
index multiplied by non-negative `offset_ms` to each animation's `delayMs`.

## Property links

Links let a clip read a transform or opacity channel from another clip, with
optional clock offset, looping, scale, and offset. A deterministic wiggle is
also available. Links read the source's authored animation and do not chain
through other links, so cyclic dependencies are not evaluated.

```json
{
  "animationLinks": [
    { "target": "positionX", "sourceClipId": "camera-card",
      "source": "positionX", "timeOffsetMs": 0, "scale": 0.35 },
    { "target": "rotation", "kind": "wiggle", "amplitude": 0.025,
      "frequencyHz": 1.4, "seed": 8 }
  ]
}
```

Channels are `positionX`, `positionY`, `scale`, `rotation`, and `opacity`.
Links are per clip and support up to 32 entries in the document schema.

## Space, layout, and timing

`camera2d` is optional on the sequence document, persists through timeline
load, autosave, update, and document versioning, and may be set to `null` to
clear it. Layers with `transform.depthPx` participate in camera perspective.
The camera position and depth can be keyframed on absolute timeline times.
`focusDepthPx` and `aperturePx` set a shallow depth-of-field blur.

```json
{
  "camera2d": {
    "position": { "x": 0, "y": 0 }, "depthPx": 0,
    "focalLengthPx": 1400, "focusDepthPx": 0, "aperturePx": 18,
    "keyframes": [
      { "timeMs": 0, "position": { "x": 0, "y": 0 }, "depthPx": 0 },
      { "timeMs": 1200, "position": { "x": 90, "y": -20 }, "depthPx": 120 }
    ]
  }
}
```

Camera keyframes interpolate linearly. `rotationX`, `rotationY`, and
`perspective` on a clip transform provide flat-layer tilt. Layout supports
`row` or `stack` containers listing child clip IDs, and `relative` placement
against another clip's box. `fitText` sizes the relative clip to text plus
padding. Boxes are resolved from current text or shape content at render time.

```json
{
  "layout": { "kind": "row", "children": ["logo", "wordmark"], "gapPx": 24 }
}
```

Repeater copies advance by position and time, with an optional hue and
brightness step. `count` includes the original clip. The renderer caps copies
at 128. A repeater copy is a regular rendered clip with its own generated ID.

```json
"repeater": { "count": 6, "positionStep": { "x": 180, "y": 0 },
  "timeStepMs": 67, "colorStep": { "hueDegrees": 8, "brightness": -0.02 } }
```

Motion blur may be configured per clip with `samplesPerFrame` (1–32) and
`shutterAngle` (0–360 degrees). Preview and export evaluate each clip at its
own shutter sample times, so a clip can blur independently of other layers.
A value of 1 disables blur for that clip. Higher values set the minimum sample
count. Blurred clips share the scene's highest requested count, with evenly
weighted samples across each clip's own shutter window.
`temporalEcho` adds up to 32 delayed copies. `steppedTime` quantizes that
clip's sampling clock.

## Effects and transitions

The effect schema includes color grade, blur, glow, drop shadow, vignette,
sharpen, chroma key, curves, levels, lift/gamma/gain, grain, pixelate,
posterize, directional blur, lens distortion, LUTs, stylize modes, and generators.
Stylize modes include RGB split, angular radial blur, zoom blur, displacement, turbulence, glitch,
halftone, optional dither, light rays, lens flare, inner shadow/glow, and edge highlight.
Generator modes include noise, fractal, conic and mesh gradients, animated
gradient fields, particles, light leak, and grid pattern. A compact example:

```json
"effects": [
  { "id": "grain-1", "type": "grain", "enabled": true,
    "amount": 0.12, "size": 1.1, "seed": 4 },
  { "id": "bg-field", "type": "generator", "enabled": true,
    "mode": "gradientField", "scale": 6, "time": 1.2,
    "animate": true, "seed": 9, "colorA": "#10233c", "colorB": "#ec6b45" },
  { "id": "grade-lut", "type": "lut", "enabled": true,
    "intensity": 0.8,
    "cube": "LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1" }
]
```

An effect must use the fields in its effect type. For example, blur uses
`radius`, glow uses `radius` and `intensity`, and `generator` accepts `mode`,
`scale`, `time`, `seed`, and color fields. `.cube` LUTs accept 3D tables.
1D tables are rejected. Store the file contents in `cube` through the document
or effect tools. The editor does not yet provide a LUT file picker.
The Canvas compositor implements the effect chain through CPU pixel passes.
Hosts must supply scratch surfaces. Missing surfaces and unknown effect types
are reported as rendering limitations.

Compositing blend functions operate on the stored encoded-sRGB channel values.
The blend calculation does not linearize to light before combining layers.
The compositor retains premultiplied alpha for the composite step.
For dark gradients, an optional `stylize` effect with `mode: "dither"`,
`amount: 1`, and a fixed `seed` adds reproducible noise around the stored
8-bit values. This reduces visible banding but does not recover precision
already lost in the source or guarantee that a video encoder preserves it.

Transitions live on the incoming clip as `transitionIn`, with `durationMs`.
On a group clip, the transition applies to one precomposed surface containing
its children. Keep children parented to the group on their own tracks. An
overlapping previous sibling on the same track and under the same parent is
the outgoing partner; without one, the group enters over the existing frame.
Supported types are `crossfade`, `dipToColor`, `wipe`, `push`, `slide`,
`zoom`, `whip`, `zoomBlur`, `glitch`, `gradientWipe`, `iris`, and `lightLeak`.
Type-specific fields include `color` for `dipToColor` and `lightLeak`, `direction`
for wipe, push, slide, whip, and gradient wipe, and `softness` for wipe,
gradient wipe, and iris. `gradientWipe` thresholds a spatial field selected by
`map: "linear" | "radial" | "noise"`. `scale` sets noise frequency and `seed`
fixes its pattern. `lightLeak` overlays a localized color field rather than
covering the frame with a solid. Its `scale` sets falloff and `seed` shifts the
field. Easing uses the same grammar as animation easing.

```json
"transitionIn": { "type": "gradientWipe", "durationMs": 420,
  "direction": "left", "map": "noise", "scale": 8, "seed": 7,
  "softness": 0.12, "easing": "easeInOutExpo" }
```

## Failure modes

These authoring mistakes render without an error. The frame is wrong, and the
render does not say why. `nodetool timeline validate` reports the ones with a
code.

| Symptom | Cause | Fix | Code |
|---|---|---|---|
| Every letter or word of a staggered text moves at once. | The compiler fits `durationMs` plus every unit's delay into the time left in the clip. When the span does not fit, it shrinks the offset, down to 0. An animation as long as its clip, or an `"out"` animation that ends mid-clip, leaves no room. | Use role `"in"` with `delayMs + durationMs + (units − 1) × offsetMs` inside the clip. End the curves and style tracks at rest. | `stagger_compressed` |
| A generator or stylize effect with `animate: true` stays still. | `animate` stamps the frame time into the effect's `time`. Some modes never read it, such as `conicGradient`, which turns only through `angle`. | Animate the field the mode reads, such as `effect.<id>.angle`, with a style track. | `effect_animate_ignored` |
| A stylize `gradientWipe` changes shape over time. | That mode reads `time` as its map selector. `animate` stamps seconds into it, so the map goes from linear to radial to noise. | Set `time` and leave `animate` off. | `effect_animate_ignored` |
| A wiggle or a follow link removes the clip's own motion or placement on that channel. | A link sets the channel's value. It does not add to the clip's animations or transform, and a wiggle centres on the channel's identity. | Put the link on a child clip and the other motion on its parent group. | `animation_link_overrides` |
| Repeater copies show on top of the next clip on the same track. | Each copy starts `index × timeStepMs` later and keeps the original duration, so the copies run past the original's end. | Keep `(count − 1) × timeStepMs` inside the gap, or parent the repeater to a group whose window ends at the cut. | `clips_overlap` |
| A spinning layer that is tilted in 3D wobbles instead of turning flat. | The clip's own `rotation` turns the picture after its own `rotationX` tilt, in the screen plane. | Put `rotationX` and `perspective` on a parent group. Put the spin on the child. | |
| A generated green-screen subject keeps a dark smudge under it. | `chromaKey` matches by RGB distance. A floor shadow is darker than the key colour and survives the tolerance. | Add a `rect` mask that ends above the floor. | |
| A lens flare, light rays or a light leak does not reach the background. | The lighting stylize modes (`lightRays`, `lensFlare`, `innerGlow`, `edgeHighlight`, `lightLeakOverlay`) add light only where the layer has alpha. | Put the effect on an `adjustment` clip, which treats the composite below it. | |

## Composition examples

The repository includes stored composition examples for `title-slam`,
`word-cards`, `window-frame`, `number-ticker`, `lower-third`, and `logo-sting`.
See [the example compositions](https://github.com/nodetool-ai/nodetool/tree/main/packages/base-nodes/nodetool/examples/compositions).
They are starting documents, not a guarantee that every editor surface exposes
each authoring field as a control.
