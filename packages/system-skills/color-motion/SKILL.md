---
name: color-motion
description: Choose and animate colour on a NodeTool timeline, including shape and text gradients, colour grades, 3D LUTs, and dither. Use when building a look, matching shots, animating colour, or fixing muddy, washed-out, or banded frames.
---

# Colour in Motion → palettes, grades and what can move

Choose colours for shapes and type, then grade the picture around them. Authored
colours, gradient stops, and effect fields can move through animation style
tracks as well as the preset grade channels.

`motion-graphics` carries the op contract for the calls named here.
`motion-direction` decides whether colour is one of the channels this piece
moves at all.

## Build a restrained palette

One primary, one accent, two or three neutrals. Get depth from lightness and
chroma, not from more hues — extra hues fight for attention and read as amateur.

Reason in OKLCH while you choose (`oklch(L C H)`: perceptual lightness, chroma,
hue angle) because holding L and C while rotating H gives hues of equal visual
weight, which HSL cannot do. Prefer hex in the document for static colours;
the shared parser also accepts named, RGB, and HSL colours in style tracks.

On dark plates make the accent pop with high lightness and moderate chroma rather
than maximum saturation. A blown-out saturated accent vibrates on black.

Tint the neutrals a little toward the primary hue. Pure grey next to coloured
elements reads as disconnected.

## Where colour lives

| Surface | Field |
|---|---|
| Text | `textStyle.color`, plus `stroke.color`, `shadow.color`, `background.color` |
| Text, gradient | `textStyle.fill` — wins over `color` when set |
| Shape | `shapeStyle.fill` and `stroke`, or `shapeStyle.fillStyle` for a gradient |
| Captions | `captionStyle.color`, `activeColor`, `outline`, `background` |
| Transition | `set_transition` `dipToColor` `color` |
| Picture | `set_effects` — `color`, `curves`, `levels`, `liftGammaGain`, `lut`, `stylize`, `generator` |

A gradient fill is `{type: "linear", angle, stops}`, `{type: "radial", stops}` or
`{type: "solid", color}`. Stop offsets are 0..1, so a fill is independent of the
shape's size:

```json
{"op": "add_shape_clip", "shape": {"kind": "rect", "x": 0, "y": 0,
 "width": 1, "height": 1,
 "fillStyle": {"type": "linear", "angle": 90, "stops": [
   {"offset": 0, "color": "#0b0f1a"}, {"offset": 1, "color": "#1b2440"}]}}}
```

## Move authored colour and the grade

Use `styleTracks` on a stored animation to interpolate authored colours or
gradient fields. Supported targets include `text.color`, `shape.fill`,
`shape.stroke`, `text.fill.angle`, `text.fill.stops.0.color`,
`shape.fillStyle.angle`, and `shape.fillStyle.stops.0.color` or `.offset`.
The target must name a field the clip already has. `text.color` is hidden by a
text gradient; `shape.fill` is hidden by `shapeStyle.fillStyle`. Colour
keyframes accept supported CSS colours, including hex, RGB, HSL, and names.
Effect color tracks can address `effect.<effect-id>.colorA` or `.colorB` on
generators, and `.color` on drop shadow, chroma key, or the color-using stylize
modes: `lightRays`, `lensFlare`, `innerShadow`, `innerGlow`, `edgeHighlight`,
and `lightLeakOverlay`. The glow renderer does not use `glow.color`.
The field must already exist on the effect. A string field such as `mode` is
not a color target.

For a document with a text gradient, this animation moves its first stop:

```json
{"id": "colour-shift", "role": "in", "preset": "fade", "durationMs": 600,
 "styleTracks": [{"target": "text.fill.stops.0.color", "keyframes": [
   {"t": 0, "value": "#8bd5ff"}, {"t": 1, "value": "#ffffff"}]}]}
```

`edit_timeline`'s `animate_clip` input does not accept `styleTracks`; it
discards that field. Author these animations in the whole document through
`set_timeline_document`, which validates before writing and snapshots the
previous document. See `motion-graphics` for that call's contract. For a
targeted edit through `animate_clip`, use numeric grade presets or custom
curves. Three useful approaches:

1. **Animate the grade channels.** `hue` (degrees, adds), `saturation` (0..4,
   multiplies), `brightness` (−1..1, adds), `contrast` (0..4, multiplies),
   `temperature` and `tint` (−1..1, add) are all animatable properties. A
   `custom` curve on `saturation` from 0 to 1 is a colour bloom; `colorFade` is
   that as a preset, and `hueShift` is a full wheel per `loop` cycle.
2. **Animate a style track.** Move a shape or text colour, or a gradient stop,
   when the clip already carries that style.
3. **Cross-fade two clips.** Overlap two shapes with different fills when the
   change also needs a distinct texture or layout.

Interpolating hue by rotation is not the same as interpolating between two
colours: `hue` takes the wheel's path, so blue to amber travels through green
unless you go the other way with a negative value.

## Grade the picture

`set_effects` replaces the whole chain. Spatial, stylize, generator, and LUT
steps follow list order. The renderer aggregates legacy colour and blur fields
into later passes, so reordering two `color` effects does not create two
separate grades. Use a separate adjustment clip for a shared look that must
follow individual shot corrections.

Choose adjustments in this order, then judge the final render:

1. `levels` — set the black and white points first.
2. `color` with `brightness`, `temperature` and `tint` — exposure and cast.
3. `curves` or `color` `contrast` — the tonal range.
4. `color` `saturation` and `hue` — midtone colour.
5. `liftGammaGain` — separate shadow and highlight colour. Keep it subtle.
6. `lut` — paste the contents of a 3D `.cube` table into `cube` and set
   `intensity` for the mix. 1D tables are refused. A LUT's domain and table
   values may extend outside 0..1; the renderer clamps the final colour after
   interpolation.
7. `vignette`, and any `glow`, to finish the look.

Neutral values are the identity: `brightness` 0, `contrast` 1, `saturation` 1,
`hue` 0, `gamma` 1, `lift` `[0,0,0]`, `gain` `[1,1,1]`. A `lut` effect requires
the complete `.cube` text.

Grade every shot in a sequence the same way, or they will not cut together. When
one shot needs its own correction, correct it toward the others first and apply
the shared look after.

## Check the grade on frames and in motion

`preview_timeline_frame` uses Canvas 2D pixel passes for the supported effect
chain, including colour grading, LUTs, stylize modes, generators, and dither.
Compare a frame at the same timecode with the GPU render when judging a subtle
effect or a translucent edge. A missing scratch surface appears in the frame's
`degraded` report. The frame lists unsupported effect types in
`effects_not_applied`; `validate_timeline` reports them as `unknown_effect`.

Compositing blends stored encoded-sRGB channel values. It does not linearize
them before combining layers. Judge a 50% blend by that output, rather than
expecting a linear-light midpoint.

## Contrast and legibility

`validate_timeline` reports `text_illegible` for type under 2.5% of frame height
or under a 3:1 contrast ratio against its own `background` plate or a full-frame
shape behind it. The check refuses to guess: a colour it cannot parse, a
translucent plate, gradient-filled type or a backdrop it cannot prove is behind
the text produces **no finding at all**. A silent pass is not a pass — look at
the frame.

Three fixes, cheapest first: a `background` scrim on the text style, a `stroke`
under the glyphs, or a shape clip at 40–60% black between the picture and the
text. The scrim goes on a track index between them, because the lowest index
draws on top.

## Banding and muddy midpoints

A wide gradient across a dark frame can band. Add
`{"type":"stylize","mode":"dither","enabled":true,"amount":1,"seed":4}`
after the gradient, with a fixed seed for repeatable frames. Dither reduces
visible 8-bit steps; it cannot recover precision already lost in source media
or guarantee that a video encoder keeps the noise. You can also shorten the
gradient span or bring its stops closer in lightness. A `generator` effect with
`mode: "noise"` or `"fractal"` makes a visible texture when that is the look,
not just a banding fix.

A gradient that reads grey in the middle has stops that pass through low chroma.
Add a third stop at the midpoint, chosen with its chroma held up, rather than
trusting the two-stop path.

## Colour as a motion channel

Colour carries the same three-layer ranking motion does. The hero can hold the
only saturated accent in the frame while the bed sits desaturated under a `color`
effect at `saturation` 0.6 — a hierarchy the eye reads before any movement
starts. A `flash` emphasis (a brightness spike) is the loudest colour event
available; one per piece.

## Before you finish

- One primary, one accent, two or three neutrals, neutrals tinted toward the
  primary.
- Static colours written in supported CSS syntax, preferably hex.
- The effect chain in grading order, and the same look on every shot in the cut.
- The look checked on preview frames and a rendered segment.
- Text legible over its actual backdrop, checked by looking.
