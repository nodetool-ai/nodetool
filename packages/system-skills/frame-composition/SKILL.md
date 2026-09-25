---
name: frame-composition
description: Stage the frame on a NodeTool timeline — grids, focal placement, safe areas per aspect ratio, depth layers and parallax, camera moves, and where elements enter and leave. Use when placing titles, lower thirds, shapes or overlays, when a layout must survive 16:9 and 9:16, when adding a push or a parallax move, or when a frame reads flat or cramped. Not for what a clip says or when it cuts.
---

# Frame Composition → staging on the timeline

Where things sit, how deep the frame is, and how the camera moves through it.
`motion-graphics` carries the tool contract; this decides the coordinates you
pass it.

## Four coordinate spaces, and mixing them is the usual bug

| What | Space | Read as |
|---|---|---|
| `shapeStyle.x/y/width/height`, `x2/y2`, `d` | 0..1 of the **frame** | 0.5 is the frame's middle |
| `set_mask` `x/y/width/height`, `d` | 0..1 of the **layer** | 0.5 is the clip's own middle, not the frame's |
| `positionX` / `positionY` curves | canvas px | Absolute, and folds as `replace` |
| `offsetX` / `offsetY` curves | canvas px, added | Composes with everything else |
| `slide` `distance`, `kenBurns` `driftX/driftY` | fraction of frame width or height | 0.3 travels 30% of the frame |
| `anchorX` / `anchorY` | 0..1 | The point a scale or a rotation pivots on |
| `textStyle.fontSizePx` | sequence px | Against `height` from `get_timeline`, not the preview width |
| `transform.depthPx`, `camera2d.position/depthPx/focalLengthPx` | sequence px | Perspective; clip depth also orders clips within one track |
| `layout.gapPx`, `fitText.paddingXPx/paddingYPx` | sequence px | Measured against the rendered text or shape box |

Read `width`, `height` and `fps` off `get_timeline` before you compute anything.
A layout authored against 1920×1080 and saved onto a 1080×1920 sequence is off
by more than a crop.

## Grid

Twelve columns for landscape, six for vertical. For a 1920-wide frame with a
100px outer margin and a 24px gutter:

```
content = 1920 − 2×100 = 1720
column  = (1720 − 11×24) / 12 = 121.3px
```

Space everything in multiples of 8. `fontSizePx` for body copy sits near 2.5–4%
of frame height; below 2.5% `validate_timeline` reports `text_illegible`.

## One focal point

Place the subject on a thirds power point, not dead centre, unless the piece
uses symmetry deliberately. The intersections:

| Sequence | Power points (px) |
|---|---|
| 1920×1080 | x 640 / 1280, y 360 / 720 |
| 1080×1920 | x 360 / 720, y 640 / 1280 |
| 1080×1080 | x 360 / 720, y 360 / 720 |

Rank the eye's path by **size, then contrast, then colour, then position**. One
primary per frame; everything else supports. Leave negative space around it —
a frame filled edge to edge reads as cheap and gives the motion nowhere to go.

## Depth: planes and track order

Split the picture into background, midground and foreground. Track index
controls order **between** tracks: lowest index draws on top. Within one
track, clips sort by `transform.depthPx`: farther values draw first and
nearer, positive values draw later, in front. The same depth controls
perspective under the sequence's `camera2d`. Moving a clip to another track
changes its overlap order but not its camera distance.

| Plane | Suggested track index | Clip depth | Motion and look |
|---|---|---|---|
| Foreground | lowest | Nearer, positive | The move the eye follows; sharp unless focus shifts |
| Midground | middle | Around zero | The subject and contrast peak |
| Background | highest | Farther, negative | Small drift and lower contrast |

For flat parallax, run three speeds over one window. One `kenBurns` per layer
with `zoom: 0` and a different drift is a `fullClip` preset, so all three
cover the same span:

```json
{"role": "loop", "preset": "kenBurns",
 "params": {"zoom": 0, "driftX": -0.02, "driftY": 0}}
```

Background −0.02, midground −0.06, foreground −0.12. One layer at one speed is
not parallax, it is the template moving.

For a shared 2.5D move, give the layers distinct `transform.depthPx` values and
keyframe the sequence's `camera2d`. Its absolute `timeMs` keyframes interpolate
camera position and depth linearly. `focusDepthPx` and `aperturePx` control depth of
field. Use one camera move to connect the planes, then inspect a middle frame
for unwanted scale or blur. Set track indexes for overlap between tracks and
clip depth for order within a track.

For a tilted card wall, parent the cards to a group with the wall's 2D
`rotation`, `rotationX`, and `perspective`. Give each card its own `depthPx`
and scroll curve, then use `camera2d` for the shared push and depth blur.
This is a flat card projection: preview the wall at several frames to check
that spacing, overlap, and blur read as one assembly.

For a move with a shape of its own, write a `custom` curve instead and mind the
role: an `in` window holds its `t=0` values before it and contributes nothing
after, an `out` window holds its `t=1` values after it, and a `loop` repeats its
cycle — so a one-way travel that must stay where it landed is an `out`, and a
`loop` curve has to return to the value it started on or it jumps every cycle.

Parent the assembly to a group when the layers must hold their relationship
through a move: `add_group`, then animate the group. Children keep their own
tracks, so grouping never changes what covers what.
For a transition on the assembled picture, set `transitionIn` on the group. The
children stay parented on their own tracks while the transition acts once on
their precomposed surface.

Shape geometry is rasterized inside a frame-sized source surface before the
clip is placed. Keep normalized `shapeStyle` geometry inside that surface,
then move the clip or parent group with `transform.position` or custom
`offsetX`/`offsetY` curves for scrolling walls and flying cards. Geometry
authored outside the source surface clips before placement.

## Camera moves

Choose between a sequence camera move and a local clip move. `camera2d`
keyframes move the view across all depth planes. A layer animation moves one
clip, and its `anchor` decides where scale or rotation pivots.

| Move | How | Timing |
|---|---|---|
| Push / pull | `kenBurns` with `zoom` 0.08–0.2 and `direction` in or out | 1500–4000ms, `easeInOut` |
| Drift | `kenBurns` `driftX` / `driftY`, ±0.02–0.08 | Same window as the zoom |
| Pan | `custom` curve on `offsetX` across the clip | 800–2000ms, `easeInOut` |
| Whip | `offsetX` over 150–250ms with a `blur` effect at 12–24px | On a cut, never mid-shot |
| Follow | `offsetX` and `offsetY` tracking the subject, subject held off-centre and leading | Whatever the action takes |

`camera2d` is a document field. `set_clip_params` changes a clip's `transform`
but refuses `camera2d`, `layout`, `repeater`, `motionBlur`, and other new document
fields. Read the full document with `get_timeline`, change the relevant fields,
then write the full document with `set_timeline_document`. Keep its tracks,
clips, markers, tempo, setup, media tracks, template identity, and other fields
in the write. `motion-graphics` carries the
tool contract.

`kenBurns` is `fullClip`: it ignores `durationMs` and `delayMs` and runs across
the whole clip. To time a push to something shorter, write it as a `custom`
`scale` curve instead.

One move per beat. A push plus a pan plus a rotate reads as chaos, and the three
fold together into a direction nobody chose.

## Enter and exit

Motion that follows reading direction feels natural; reversing it reads as going
back. Match `slide`'s `direction` to intent — it names the edge the element
arrives **from**:

- New content: from the right, or from below.
- Dismissing or undoing: reverse the entrance.
- Drilling in: `pop`, or a scale curve rather than a travel.

Enter and leave through the nearest edge. Keep `distance` at or below 0.35 or
the travel reads as a slide of the whole template — pair a longer move with a
scale or opacity change on the same window. Same vocabulary on the cut:
`set_transition` `direction` on `wipe`, `push` and `slide` also names the edge
the incoming clip arrives from.

## Safe areas

Keep titles, logos, faces and calls to action inside the margin. The numbers are
fractions of the frame, so convert against `width` and `height`.

| Aspect | Top | Bottom | Sides |
|---|---|---|---|
| 16:9 | 5% | 5% | 5% |
| 9:16 | 12–14% | 18–20% | 6% |
| 1:1 | 7% | 7% | 7% |
| 4:5 | 8% | 8% | 6% |

On 1080×1920 that leaves the usable band roughly y 250 to y 1570. A caption clip
already sits at `bottomMarginFrac` 0.12 by default, which is inside the phone UI
zone on some platforms — raise it rather than assuming.

## One layout, several aspects

Master in the widest target with the focal point inside the centre band, then
**restack** for vertical: move the headline above the subject, pull the subject
up out of the bottom UI zone, and raise `fontSizePx` by about 20%. Cropping a
16:9 layout to 9:16 clips whatever sat in the outer columns, which is usually the
logo and the call to action.

Use `layout: {kind: "row" | "stack", children: [clip ids], gapPx}` to keep a
group's spacing tied to its members. Use a clip's `layout: {kind: "relative",
targetClipId, side, gapPx}` for a label or plate that follows another clip.
For a shape behind text, `fitText: {paddingXPx, paddingYPx}` sizes the shape
against the text's current box, including animated font size. These relations
avoid redoing pixel math for each text change. A 16:9 document still needs a
separate placement pass for 9:16, with safe areas checked at that size.

## Check the frame, not the document

`preview_timeline_frame` composites the real picture — every track in order,
transforms and opacity applied, animations mid-flight. Read the layer list it
returns beside each frame: it names the stack top first with each layer's
`z_index`, `opacity` and wipe progress, which answers most staging questions
without looking at a pixel.

Preview at the midpoint of every move, not at its ends. What frames catch and a
validator cannot: a title that slid outside the frame, a scrim covering the face
it was meant to sit beside, a lower third under the wrong element because two
track indexes are the wrong way round, a layer that never draws because it is on
an audio track.

## Before you finish

- One focal point, on a power point or deliberately centred.
- Every element assigned a track for overlap order and a depth plane when the camera moves.
- One camera move or eased layer move, 800–4000ms.
- Entrances through the nearest edge, `distance` ≤ 0.35 or paired with a second
  channel.
- Critical content inside the safe margin for every target aspect, vertical
  restacked rather than cropped.
- Previewed at the midpoints, and the layer stack read.
