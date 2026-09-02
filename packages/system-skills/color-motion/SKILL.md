---
name: color-motion
description: Choose and animate colour on a NodeTool timeline — restrained palettes, gradient fills for shapes and type, the grading order of a clip's effect chain, and which colour channels can actually move. Use when building a look, grading shots so they cut together, animating a colour change, or fixing a frame that reads muddy, washed out or banded. Not for the words or the cut.
---

# Colour in Motion → palettes, grades and what can move

Two separate jobs: the colours you author into shapes and type, and the grade you
apply over picture. They meet in the animated grade channels, which are the only
colour values on a timeline that move.

## Build a restrained palette

One primary, one accent, two or three neutrals. Get depth from lightness and
chroma, not from more hues — extra hues fight for attention and read as amateur.

Reason in OKLCH while you choose (`oklch(L C H)`: perceptual lightness, chroma,
hue angle) because holding L and C while rotating H gives hues of equal visual
weight, which HSL cannot do. Then **write hex into the document**: `color`,
`fill` and every effect colour are CSS colour strings, and a hex that every
surface parses is worth more here than a notation one might not.

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
| Picture | `set_effects` — `color`, `curves`, `levels`, `liftGammaGain` |

A gradient fill is `{type: "linear", angle, stops}`, `{type: "radial", stops}` or
`{type: "solid", color}`. Stop offsets are 0..1, so a fill is independent of the
shape's size:

```json
{"op": "add_shape_clip", "shape": {"kind": "rect", "x": 0, "y": 0,
 "width": 1, "height": 1,
 "fillStyle": {"type": "linear", "angle": 90, "stops": [
   {"offset": 0, "color": "#0b0f1a"}, {"offset": 1, "color": "#1b2440"}]}}}
```

## Colour does not tween — the grade does

Nothing on a timeline interpolates one hex to another. `textStyle.color` and
`shapeStyle.fill` are fixed for the clip's life. Three ways to make colour move,
in order of how often they are the right answer:

1. **Animate the grade channels.** `hue` (degrees, adds), `saturation` (0..4,
   multiplies), `brightness` (−1..1, adds), `contrast` (0..4, multiplies),
   `temperature` and `tint` (−1..1, add) are all animatable properties. A
   `custom` curve on `saturation` from 0 to 1 is a colour bloom; `colorFade` is
   that as a preset, and `hueShift` is a full wheel per `loop` cycle.
2. **Cross-fade two clips.** Two shapes with different fills, overlapping on one
   track, dissolve between them — the only way to move between two authored
   colours rather than around the wheel from one.
3. **Re-author the clip.** For a look that changes once at a cut, a second clip
   is cheaper to reason about than any curve.

Interpolating hue by rotation is not the same as interpolating between two
colours: `hue` takes the wheel's path, so blue to amber travels through green
unless you go the other way with a negative value.

## Grade in order — the chain applies in the order you give it

`set_effects` replaces the whole chain and applies it in list order, so the list
**is** the grading order. Reordering changes the result.

1. `levels` — set the black and white points first.
2. `color` with `brightness`, `temperature` and `tint` — exposure and cast.
3. `curves` or `color` `contrast` — the tonal range.
4. `color` `saturation` and `hue` — midtone colour.
5. `liftGammaGain` — split-tone: `lift` cools the shadows, `gain` warms the
   highlights. Teal shadows and warm highlights is the cinematic default because
   it flatters skin. Keep it subtle.
6. `vignette`, and any `glow`, last — they bind the frame.

Neutral values are the identity: `brightness` 0, `contrast` 1, `saturation` 1,
`hue` 0, `gamma` 1, `lift` `[0,0,0]`, `gain` `[1,1,1]`. An effect named with
nothing set does nothing rather than being refused.

Grade every shot in a sequence the same way, or they will not cut together. When
one shot needs its own correction, correct it toward the others first and apply
the shared look after.

## Judge the grade from a render, not a preview frame

`preview_timeline_frame` is a 2D compositor. It maps `color` and `blur` onto the
canvas filter and has **no equivalent** for `chromaKey`, `vignette`, `sharpen`,
or the `temperature` and `tint` fields of a `color` effect. It names them in
`effects_not_applied` instead of dropping them silently. Motion is unaffected —
use frames to judge timing and placement, and `render_timeline` to judge a look.

`unknown_effect` means this build cannot apply that type at all and the layer
draws ungraded.

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

A wide gradient across a dark frame bands. There is no noise generator on the
timeline, so the fixes are: shorten the gradient's span, move the stops closer in
lightness, or lay a texture image clip over it at 3–6% opacity with `blendMode`
`overlay` or `soft-light`.

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
- Every colour written as hex the document can parse.
- The effect chain in grading order, and the same look on every shot in the cut.
- Anything the frame preview cannot draw judged from a render.
- Text legible over its actual backdrop, checked by looking.
