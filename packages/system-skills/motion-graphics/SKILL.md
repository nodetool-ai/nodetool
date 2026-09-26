---
name: motion-graphics
description: Author and inspect NodeTool timeline motion, including clip animations, document-level style tracks, links, layout, camera, effects, transitions, and reusable compositions. Use for title cards, kinetic text, lower thirds, clip entrances and exits, and layered motion.
---

# Motion Graphics → Timeline Agent

Motion is timed, layered and checked. Author animations with `edit_timeline`,
then look at the frames with `preview_timeline_frame`. A change you have not
looked at is not done.

## Load the craft skill for the job

This file is the tool contract: what a call takes and what it refuses. Eight
skills sit on top of it and decide what to put in those calls. Load the one the
job is about, and come back here for argument shapes.

| The question | Skill |
|---|---|
| How long, which easing, how much stagger, why does this feel stiff | `motion-principles` |
| What rules does the whole piece obey; it feels busy or inconsistent | `motion-direction` |
| Where does it sit, does it survive 9:16, how do I get depth | `frame-composition` |
| Where do the cuts land, how do I pace it, how do I ramp a hit | `beat-sync-editing` |
| Which colours, in what order do I grade, what can actually move | `color-motion` |
| A preset is close but not right; overshoot, decay, wiggle, arc, draw-on | `motion-curves` |
| A logo sting, an end card, a splash | `logo-reveal` |
| An ambient bed behind the content | `motion-background` |

Three are neighbours rather than layers. `caption-titles` decides what text
says and when it appears. `video-audio-continuity` decides, before the first
clip renders, whether a multi-scene piece's sound comes from one generated clip
or from a track of your own — a decision this file's ops cannot undo. The
board skills (`explainer-storyboard`, `commercial-beat-sheet`,
`launch-commercial`, `music-video-treatment`, `trailer-template`) decide the
shots before there is a timeline to animate; `assemble_storyboard_timeline` is
where their board becomes this file's document.

Anything generated for the timeline — a bed, a sting, a voice, a clip — has a
model line with its own guide. `find_model` returns `prompting_skill` on a
route it covers; `load_skill` it before writing that prompt.

## Read before you animate

Call `get_timeline` first. You need the sequence's `fps`, `width`, `height`,
the track list with each track's `index` and `type`, and every clip's
`startMs`, `durationMs`, `mediaType` and existing `animations`. Animate nothing
until you have clip ids from the document — never a guessed one.

Snapshot with `create_timeline_version` before your first edit. Motion work is
iterative and a wrong `mode: "replace"` wipes animations somebody wrote.

## Choose the authoring surface

`edit_timeline` takes a timeline ID and an `ops` array. Its ops run in
order, up to 60 per call. Inspect each op's `ok` and the batch's `failed`
result before a dependent edit. In an in-product agent, use the matching
`ui_timeline_*` tool for an individual op. For example, this is a valid
headless call:

```json
{"timeline_id":"<id>","ops":[{"op":"animate_clip","target":"Title","animations":[{"role":"in","preset":"fade","durationMs":400}]}]}
```

The `animate_clip` input accepts catalog presets or `custom` curves and code,
plus `stagger` and a typewriter `caret`. It does **not** author `styleTracks`,
`textAnimator`, or `beat`. `set_clip_params` does **not** author `layout`,
`repeater`, `motionBlur`, `steppedTime`, `temporalEcho`, `animationLinks`, or
`transform.depthPx`. Adding those keys to an op does not write those features.

For those fields, read `get_timeline`'s `timeline` object, change the needed
clip or sequence fields, and call `set_timeline_document` with a complete
document assembled from it. Preserve tracks, clips, markers, tempo, setup, templateId,
mediaTracks, transcript, scriptEnabled, and camera2d when present. Include
`timeline.updatedAt` as
`expected_updated_at` so a concurrent edit is refused. A whole-document write
validates the result and snapshots the prior version. Omitted document fields
are removed, so never send only the changed clip. The JSON objects in the
document sections below are fields to merge into that complete document, not
`edit_timeline` ops. The editor may lack controls for them even though they
render and survive a save.

## Track layering

**Lowest `index` renders on top.** Track 0 covers track 1, which covers track 2
— Premiere, Resolve and FCP order, and the opposite of a paint stack. The
compositor turns the index into `z = 1000 - index`; `preview_timeline_frame`
reports that `z_index` per layer and lists layers top of the stack first.

Four track types, and the type is a role, not a restriction on what draws:

| Type | Holds | Use for |
|---|---|---|
| `video` | picture clips, images | the cut itself |
| `overlay` | text and shape clips | titles, lower-thirds, scrims, callouts |
| `audio` | sound | music, voiceover, effects — never drawn |
| `subtitle` | text | burned-in captions |

Rules that follow from the ordering:

- A scrim goes on a **higher** index than the text it sits behind, and a lower
  index than the picture it darkens — so picture, then scrim, then text, in
  descending index order.
- Give each motion element its own overlay track when their timings overlap.
  Two animated clips on one track that overlap in time trigger an automatic
  crossfade you did not ask for (see Transitions).
- Captions are the exception you do not control: word-level captions from a
  voiceover clip composite above every real track regardless of which track
  that clip sits on. Do not build a title that expects to cover them.
- An audio clip never contributes a layer. A frame that looks empty because
  everything is on audio tracks is a track-type mistake.
- At most **8 video layers** composite at once, resolved top track first. Text,
  shape and image clips are not counted, so a stack of titles is unaffected —
  but nine overlapping video clips means the bottom one silently does not draw.
  A preview frame is how you find that out.

## Build the elements

The clips you animate are made with the same `edit_timeline` op list.

```json
[
  {"op":"add_text_clip","text":"Maya Chen","trackId":"<overlay>","startMs":4000,"durationMs":3000,"fontSizePx":64},
  {"op":"add_shape_clip","shape":{"kind":"rect","x":0,"y":0.72,"width":1,"height":0.18,"fill":"#000000"},"startMs":4000,"durationMs":3000,"opacity":0.55}
]
```

`add_text_clip` needs only `text`; the style fields (`fontSizePx`, `color`,
`background`, `stroke`) are read from the op itself or from a `style` bag, and
with no `trackId` it lands on an overlay track. `add_shape_clip` takes its
geometry in `shape` (or `shapeStyle`, or the op's own keys) with `x`, `y`,
`width` and `height` as 0..1 fractions of the frame — no geometry at all is a
full-frame rect, which is the scrim you usually want.

Tracks are the z-order, so how they are made matters:

```json
[
  {"op":"add_track","type":"overlay","name":"Titles"},
  {"op":"move_track","target":"Picture","toIndex":2}
]
```

`add_track` takes `type` (`video`, `audio`, `overlay`, `subtitle`) and an
optional `name`, and **appends to the bottom** — the highest index, which draws
last. A picture track added after the overlays therefore covers them. Add the
overlays last, or move the picture down afterwards: `move_track` takes a
`target` and one of `toIndex` (0 is the top), `before` or `after`.

## Animating a clip

`edit_timeline` with `{"op": "animate_clip", "target": <clip id or name>,
"animations": [...]}`. Each animation is `{role, preset, durationMs?, delayMs?,
easing?, params?}`. `mode` is `"replace"` (default) or `"add"`.

Four roles. A clip may carry several, one of each kind or more:

- **`in`** — entrance. `delayMs` offsets from the clip's start.
- **`out`** — exit. `delayMs` offsets backwards from the clip's **end**, so 0
  means it finishes exactly as the clip ends. This is the one people get wrong.
- **`emphasis`** — a beat mid-clip. `delayMs` from the clip's start.
- **`loop`** — runs continuously; `durationMs` is one cycle, not the total.

### The presets

`in` / `out` — `fade` (500ms), `slide` (500ms; `direction` left/right/up/down,
`distance` 0–1 of the frame, default 0.3), `pop` (500ms, easeOut; `overshoot`
1–1.5, default 1.08), `spin` (500ms; `turns` 0–2, default 0.25), `wipe` (500ms;
`direction`, `softness` 0–0.5, default 0.05), `blur` (500ms; `amount` 0–40,
default 12), `colorFade` (600ms, grayscale blooming into color).

`in` on text only — `typewriter` reveals whole characters in reading order.
Set `durationMs` to the time for the entire text to appear. Without it, the
characters type 65ms apart and finish within the clip. To set a fixed speed,
use `durationMs: 1` with `stagger: {unit: "character", offsetMs: 40}`.
`animate_clip` stores every typewriter in that form. A document you write by
hand must use it too: a stored plain `durationMs` with no `stagger` shows the
whole text at once, with no caret.

`emphasis` — `pulse` (600ms; `intensity` 0–0.5, default 0.06), `flash` (400ms;
`intensity` 0–1, default 0.6), `shake` (600ms; seeded noise on both axes:
`intensity` 0–0.2 default 0.02, `frequency` Hz default 8, `seed` default 1,
`fadeInMs`/`fadeOutMs` default 0; the same seed repeats the same motion),
`bounce` (600ms; `height` 0–0.3, default 0.05), `squash` (500ms, easeOutBack;
`amount` 0–0.5, default 0.12), `followPath` (also `loop`; `d` an SVG path in
0..1 space plus `pathX`/`pathY`/`pathWidth`/`pathHeight`, `orient` turns the
clip along the tangent, `startT`/`endT` pick a stretch of the path; writes
`positionX`/`positionY`, so it replaces the clip's position).

`loop` — `kenBurns` (3000ms; `zoom` 0–1 default 0.12, `direction` in/out,
`driftX`/`driftY` −0.2–0.2), `float` (3000ms; `amplitude` 0–0.2, `frequency`
cycles per period default 1, `seed` 0 = pure sine, else drift), `breathe`
(3000ms; `intensity` 0–0.3), `rotate` (3000ms; `direction` cw/ccw),
`hueShift` (3000ms; `direction` forward/reverse), `orbit` (3000ms; `degrees`
default 360, `direction` cw/ccw) — which sweeps a 3D clip's camera and does
nothing on any other clip.

Named easing includes `linear`, `easeIn`, `easeOut`, `easeInOut`,
`easeOutBack`, `easeOutElastic`, `easeOutBounce`, exponential, quintic, and
circular variants (`easeOutExpo`, `easeInOutQuint`, `easeOutCirc`), and `hold`
for a segment that keeps its prior keyframe value until the segment ends.
Unset means the preset's own default, and
failing that the role's — `in` gets `easeOut`, `out` gets `easeIn`. That
default is almost always right: an entrance decelerates into place, an exit
accelerates away. Reach for `easeOutBack` or `easeOutElastic` only when the
piece is playful; they read as cheap on anything corporate.

`{"op": "list_animation_presets"}` reports the exact param list when this
summary is not enough — the catalog is the authority. It is an `edit_timeline`
op like every other call here, not a tool of its own.

### Keyframes and the easing grammar

`easing` takes more than the seven named ids. `cubic-bezier(x1,y1,x2,y2)` is
the CSS curve: `cubic-bezier(0.16,1,0.3,1)` is the deceleration most entrances
want. `spring(stiffness,damping,mass)` solves a real spring, so
`spring(180,12,1)` settles with one small overshoot and `spring(180,26,1)` does
not overshoot at all. All three constants must be positive. Anything the parser
cannot read eases linearly and reports `unknown_easing`.

The presets are where motion starts, not where it stops. A custom animation is
one extra field and it reaches shapes no preset has: an entrance that overshoots
twice, a hold in the middle of a move, two channels on different schedules, a
decay, an arc, a path draw-on. Reach for one as soon as a preset is close but
not right — bending `durationMs` and `easing` around a preset that was never the
shape you wanted takes longer and lands flatter. `motion-curves` carries the
channel table and the worked recipes. Then `{"role": "in", "preset": "custom",
...}` carrying exactly one of

- `curves` — `[{property, keyframes: [{t, value, easing?}]}]`, with `t` running
  0..1 across the animation's window. The `list_animation_presets` op reports
  the animatable properties.
- `code` — a JavaScript body baked into curves once, host-side, at author time.
  Nothing evaluates at render.

Add `mask` when a curve drives `wipeProgress`; without it the wipe has no edge
to run against.

Motion that has to follow a piece of audio is a different call: `bake_audio_animation`
measures an audio clip and writes the curve onto a target clip through the
`set_baked_animation` op, either following the loudness (`mode: "envelope"`) or
pulsing on each onset (`mode: "beats"`). Its keyframes sit in the target clip's
own media, so trimming or splitting that clip re-slices the motion, and the
animation carries `bakedFrom` — running it again with different settings
replaces that curve instead of stacking a second one, and never touches a curve
you keyframed by hand. `set_markers_from_beats` is the other tool: markers to
cut against, rather than motion to animate with.

How several animations on one channel combine decides whether the second one
adds to the first or throws it away:

| Fold | Channels | Result |
|---|---|---|
| add | `offsetX`, `offsetY`, `rotation`, `blur`, `brightness`, `hue`, `temperature`, `tint` | Values sum, so a shake and a slide both move the clip |
| multiply | `scale`, `scaleX`, `scaleY`, `opacity`, `saturation`, `contrast` | Values multiply, so two half-opacity ramps give a quarter |
| min | `wipeProgress` | The tightest wipe wins |
| replace | `positionX`, `positionY`, `anchorX`, `anchorY`, `trimStart`, `trimEnd` | One value survives — the last animation in document order. The other is discarded |

The replace row is the trap. Two animations driving `positionX` over the same
instants means one of them does nothing, and `validate_timeline` reports
`replace_curves_overlap`. Move a clip with `offsetX` when you want it to
compose with other motion, and with `positionX` only when you mean an absolute
placement nothing else touches.

### Durations the contract constrains

`motion-principles` holds the numbers — how long an entrance runs, how long a
title holds. What this contract adds is what the document refuses:

- `in` + `out` together must fit inside the clip. A window that does not fit
  after its `delayMs` is clamped or never runs, and `validate_timeline` says so
  as `animation_exceeds_clip`.
- A `loop` on a clip shorter than one cycle shows a fragment of the motion.
  `kenBurns` at its 3000ms default on a 2000ms clip is a slow drift that stops
  halfway, not a Ken Burns move.

### Choosing motion that matches the cut

Pick the entrance from the edit, not from variety. A title over a locked-off
shot can `slide`; a title over a whip pan or a moving camera should `fade` or
`blur`, because sliding text plus moving picture reads as two unrelated
motions. Match the direction to the picture: text sliding against the camera
move fights it.

One motion idea per moment. A clip with `pop` in, `shake` emphasis and `spin`
out is not three times as expressive.

## Animating typography

Text clips take every preset above, and one thing media clips do not:
per-word stagger. Add `stagger` to an animation on a text clip:

```json
{"op": "animate_clip", "target": "Title", "animations": [
  {"role": "in", "preset": "pop", "durationMs": 400,
   "stagger": {"unit": "word", "offsetMs": 80, "from": "start"}}
]}
```

Each unit runs the full animation for `durationMs`, offset `offsetMs` from the
previous. `from` picks which unit leads: `start` (default), `end`, or `center`.
A stagger needs at least two units — below that it compiles as an ordinary
block animation.

`unit` is one of three, and the count is what the span math is built on:

| `unit` | One unit is | Counted as |
|---|---|---|
| `word` | a whitespace-separated word | the words in the clip's text |
| `character` | a grapheme cluster — an emoji, or a letter with its combining marks, counts once | every cluster including the spaces between words, which are timed and draw nothing |
| `line` | a wrapped line | the lines the text wraps to at the sequence's width and the clip's `fontSizePx`, not the newlines you typed |

The span is `durationMs + offsetMs × (units − 1)`, halved for `from: "center"`
(the middle unit leads and both edges run last, so the largest delay is half
the span). Six words at `offsetMs: 200` with a 500ms preset span 1500ms. The
same line at `unit: "character"` is roughly thirty units, so the same offset
spans six seconds — character staggers want offsets an order of magnitude
smaller than word staggers, and a `line` stagger changes count when the frame
does.

**A span that does not fit the clip is silently compressed, not cut off.** The
engine shrinks the per-step offset — never the per-word duration — so the last
word still completes inside the clip. Ask for 200ms of offset on a clip with
room for 60ms and you get 60ms: every word still animates, the motion is
simply tighter and more simultaneous than you wrote. `validate_timeline`
reports `stagger_compressed`.
This is the most common reason staggered type "doesn't look staggered". Work
out the span, compare it against `durationMs` minus any `delayMs`, and if it
does not fit, lengthen the clip or lower the offset yourself rather than
letting the clamp choose for you.

`loop` staggers are the exception: the offset is a phase shift, so it is
neither stretched nor clamped.

Which offset reads as texture and which reads as one word at a time is in
`motion-principles`, with the line-length limit that goes with it.

For several separate clips, `stagger_animations` shifts existing animation
delays in the order of `clip_ids` without moving the clips. Give at least two
distinct clip IDs, each already animated, and a non-negative `offset_ms`.
The in-product tool is `ui_timeline_stagger_animations` with the same fields.

```json
{"op":"stagger_animations","clip_ids":["logo-id","title-id","tagline-id"],"offset_ms":80}
```

Stagger applies only to text clips and only to transform and opacity motion.
`wipe`, `blur` and `colorFade` stay block-level even with a stagger set — the
mask and effect curves are per-layer, not per-word. A stagger on a media clip
is ignored, not an error, so a "why isn't it staggering" bug is usually a clip
that is not `mediaType: "text"`.

Type sizes are authored against the sequence resolution: `fontSizePx` on a
1920×1080 sequence means the same thing at any preview width.

## Document motion fields

The fields below belong to clips in the complete timeline document. Merge
them into the clip read by `get_timeline`, retaining its other fields and
animations, then write the full document with `set_timeline_document`.
`edit_timeline` and `ui_timeline_animate_clip` do not accept them as animation
inputs.

`styleTracks` animate visual properties in the same animation window as a
preset. Each stored animation needs `id`, `role`, `preset`, and `durationMs`.
Targets include `text.color`, `shape.fill`, `shape.cornerRadius`,
`clip.borderRadius`, `mask.featherPx`, `effect.<effect-id>.<numeric-field>`,
supported effect colors such as `effect.bg-field.colorB`,
gradient stops, and compatible `shape.d` or `mask.d` paths. The clip must
already have the targeted style, mask, or effect. A per-glyph target such as
`glyph.color` also needs text `stagger`.

```json
{"animations":[{"id":"title-color","role":"in","preset":"fade","durationMs":600,"styleTracks":[{"target":"text.color","keyframes":[{"t":0,"value":"#8bd5ff"},{"t":1,"value":"#ffffff","easing":"easeOutExpo"}]}]}]}
```

`textAnimator` changes text content over its animation window. `ticker`
supports `from`, `to`, `decimals`, `padTo`, `prefix`, and `suffix`.
Set `groupSeparator` to `","` for grouped thousands such as `2,847`;
without it the output stays ungrouped. `scramble` supports `charset` and
deterministic `seed`. It needs a text clip.
An animation's `beat` binds its start to a one-based beat index at the live
sequence tempo; `scope` is `clip` or `sequence`, and `offsetMs` moves it around
that beat. `delayMs` still applies on top.

```json
{"id":"count-up","role":"emphasis","preset":"custom","durationMs":900,"beat":{"index":3,"scope":"sequence","offsetMs":-20},"textAnimator":{"kind":"ticker","from":1,"to":7,"padTo":2}}
```

`animationLinks` copy a source clip's authored `positionX`, `positionY`,
`scale`, `rotation`, or `opacity` channel, with optional time offset, loop,
scale, and offset. A `wiggle` link supplies seeded motion without a render-time
script. Links do not follow the source's own links. Resolve each
`sourceClipId` against the document's clip IDs before writing it. An opacity
link replaces the target clip's own opacity while its group and transition
coverage still multiply the result.

```json
{"animationLinks":[{"target":"positionX","sourceClipId":"leader-id","source":"positionX","scale":0.35},{"target":"rotation","kind":"wiggle","amplitude":0.025,"frequencyHz":1.4,"seed":8}]}
```

`layout` places clips as a `row`, `stack`, or `relative` relation. A row or
stack lists child clip IDs; a relative clip uses `targetClipId`, `side`, and
optional `fitText` padding. `repeater.count` includes the original clip and
is capped at 128. `timeStepMs` offsets each copy in time. These are fields on
a clip, not new clip records to add by hand.

Do not scroll a still plate by tiling it with a `repeater`. Each copy meets the
next at a seam, and the seam shows when the image differs at its edges. A
generated rain plate is denser at the top, so it always does. To make rain
fall, move one plate to a random offset on `hold` keyframes every two frames.
This reads as falling rain and has no seam.

```json
{"layout":{"kind":"row","children":["logo-id","wordmark-id"],"gapPx":24},"repeater":{"count":3,"positionStep":{"x":180,"y":0},"timeStepMs":67}}
```

`camera2d` is a sequence document field. It needs `position`, `depthPx`, and
positive `focalLengthPx`. Keyframes use absolute `timeMs` and include position
and depth. Add `depthPx` to a clip's existing `transform` for perspective;
`focusDepthPx` and `aperturePx` add depth-of-field blur. `camera2d: null`
clears the camera.

For a tilted wall of cards, use a parent group's `rotation`, `rotationX`, and
`perspective` for the shared tilt, each card's `depthPx` and scroll animation
for the separate planes, and `camera2d` for the push and depth blur. Keep a
shape's normalized geometry inside the frame-sized source raster. Move the
clip or group with `transform.position` or custom `offsetX`/`offsetY` curves
to scroll or fly it across the frame; geometry outside that raster is clipped
before the transform places it.

```json
{"camera2d":{"position":{"x":0,"y":0},"depthPx":0,"focalLengthPx":1400,"keyframes":[{"timeMs":0,"position":{"x":0,"y":0},"depthPx":0},{"timeMs":1200,"position":{"x":90,"y":-20},"depthPx":120}]}}
```

`motionBlur` is per clip: `samplesPerFrame` is 1–32 and `shutterAngle` is
0–360 degrees. One sample disables blur for that clip. A higher count sets a
minimum; the scene renders at its highest requested count, with evenly
weighted samples across each layer's own shutter window. `steppedTime.fps`
quantizes a clip's source and animation clock. `temporalEcho` adds delayed
copies through `copies`, `intervalMs`, and `opacityDecay`.

```json
{"motionBlur":{"samplesPerFrame":8,"shutterAngle":180},"steppedTime":{"fps":12},"temporalEcho":{"copies":3,"intervalMs":80,"opacityDecay":0.5}}
```

## Groups

`{"op":"add_group","name":"Lower third","startMs":4000,"durationMs":4000,"children":["name-id","role-id"]}` makes a clip with no media whose transform, opacity
and window every clip naming it inherits. `{"op": "set_parent", "target":
"Name plate", "parentId": "<group id>"}` adopts a clip that already exists;
`"parentId": null` releases it, and a cycle is refused.

Rig a lower third this way: scrim, name, role, each on its own overlay track,
all three parented to one group. Then animate the **group**. One `slide` in and
one `fade` out on the group moves the assembly together and keeps the parts
locked to each other, where animating them separately is three chances to
drift.

Children keep their own tracks, so grouping does not change what covers what.
A plain group's opacity multiplies into each child. A group with an effect,
non-`normal` blend mode, or transition precomposes its children into one
surface first. The effect or transition then runs once on the assembled
picture. Put a `glow` on the group for the whole look, on a child for that
child alone.

`parent_missing`, `parent_not_group` and `parent_cycle` all mean the child
renders unparented, losing the group's transform, opacity and window.

## Transitions

A transition is between clips, not on one clip. It is authored on the
**incoming** clip and resolved for both: the compositor finds the clip beneath
it on the same track and gives that one the complementary half of the cut.
The incoming clip may be a group: `set_transition` on the group transitions
its whole precomposed assembly, with children still parented on their own
tracks. Its outgoing partner is the previous overlapping sibling on the
group's track under the same parent.

Two clips on the same track whose times overlap dissolve across the overlap
with no tool call at all. The corollary: **an accidental overlap is an
accidental dissolve.** When two clips look soft where you wanted a hard cut,
check their `startMs` and `durationMs` before looking anywhere else.

`set_transition` picks a cut instead of taking the default:
`{"op": "set_transition", "target": "Shot 2", "transition": {"type": "wipe",
"durationMs": 500, "direction": "left", "softness": 0.1}}`. Pass
`"transition": null` to clear it. The cut plays over the target's head, so
**overlap the two clips by at least `durationMs`** or there is nothing beneath
for it to play against — a transition with nothing under it reads as a fade
from black.

| Type | What moves | Reach for it when |
|---|---|---|
| `crossfade` | Incoming fades up | Two shots of the same scene; the safe default |
| `dipToColor` | Both fade through a solid | A scene change, a chapter break. `color` is yours to pick |
| `wipe` | Feathered edge reveals the incoming | A graphic or split-screen feel. `softness` 0 is a hard edge |
| `push` | Both clips travel one frame width | Lateral energy; the two read as one moving picture |
| `slide` | Only the incoming travels | The new shot arrives over a shot that holds |
| `zoom` | Outgoing grows, incoming comes in from 0.8 | A push into the next beat |
| `whip`, `zoomBlur` | Motion blur across a directional or zooming cut | Fast camera energy |
| `glitch` | Displaced digital cut | A deliberate electronic break |
| `gradientWipe`, `iris` | Spatial threshold or aperture reveal | Designed graphic transitions |
| `lightLeak` | Localized color field across the cut | A flare-like bridge |

`direction` on `wipe`, `push`, `slide`, `whip`, and `gradientWipe` names the
incoming edge. `gradientWipe` also takes `map: "linear" | "radial" |
"noise"`, `scale`, `seed`, and `softness`. `iris` takes `softness`;
`lightLeak` takes `color`, `scale`, and `seed`. `easing` takes a named id,
`cubic-bezier(...)`, or `spring(...)`.

`fadeInMs` and `fadeOutMs` on `set_clip_params` are audio fades. The compositor
does not read them, so they will not fade a picture — for that, animate the
clip with a `fade` `in` or `out`.

A transition's opacity multiplies with animation opacity rather than replacing
it, so a clip that both dissolves in and carries a `fade` in ramps twice and
reads slower and softer than either alone. Pick one.

`validate_timeline` reports `transition_exceeds_duration` when the cut is
longer than the clip carrying it, and `unknown_transition` for a type or
direction this build cannot draw — which falls back to a cross-fade running
left rather than failing the render.

## Masks and mattes

`{"op": "set_mask", "target": "Title", "mask": {"kind": "rect", "y": 0.2,
"height": 0.6, "featherPx": 24}}` cuts the layer to a shape in the clip's own
0..1 space. `kind` is `rect`, `ellipse` or `path` (with an SVG `d`).
`featherPx` softens the edge, `invert` keeps the outside instead, and
`"mask": null` clears it. A path that cannot rasterize reports
`mask_path_invalid` and the layer draws unmasked — the whole picture shows
through, the opposite of what you asked for.

`{"op": "set_matte", "target": "Fill", "matte": {"source": "Text shape",
"mode": "alpha"}}` uses another clip as this one's transparency. `alpha` reads
the source's opacity, `luma` its brightness, and `invert` flips it. **The
source clip stops drawing itself.** That is the point, and it is also why a
matte pointed at a clip you still wanted on screen reads as a deletion. Reach
for it when text has to be filled with moving footage: footage on the fill
clip, text on the source. `matte_source_missing` is an error, and the layer
then draws unmatted, showing everything the matte was hiding.

## Clip effects

`set_effects` replaces the whole chain and applies it in the
order given; an empty list clears it. The tool also accepts `pixelate`,
`posterize`, `directionalBlur`, `lensDistortion`, `stylize`, `generator`, `lut`,
and `grain` alongside `color`, `blur`, `glow`, `dropShadow`, `vignette`,
`sharpen`, `chromaKey`, `curves`, `levels`, and `liftGammaGain`. Its flat input
uses `{type, ...typeFields}`. It assigns effect IDs and enables each effect;
it does not accept stored `id` or `enabled` fields. `validate_timeline`
reports `unknown_effect` for an unrecognized type. The Canvas 2D preview
applies all known effects through CPU passes when its host supplies scratch
surfaces. `preview_timeline_frame.effects_not_applied` lists unknown types;
`degraded` reports missing surfaces and other draw limitations.

```json
{"op":"set_effects","target":"Shot 2","effects":[{"type":"grain","amount":0.12,"size":1.1},{"type":"stylize","mode":"dither","amount":1,"seed":4}]}
```

## Time remap

`{"op": "set_time_remap", "target": "Shot 3", "timeRemap": {"keyframes":
[{"t": 0, "sourceMs": 0}, {"t": 1, "sourceMs": 4000, "easing": "easeInOut"}]}}`
maps timeline time onto source time. `set_time_remap` replaces the whole map
each time it is called. `t` runs 0..1 over the clip's window and
must start at 0, end at 1 and ascend; `sourceMs` says which millisecond of the
source plays there, so a descending pair is a reverse and a flat pair is a
freeze. `"timeRemap": null` clears it, and the remap replaces the clip's rate.
A repeated or backwards `t` is `time_remap_not_monotonic`, an error.

`split_clip` and `trim_clip` refuse a remapped clip. Both would have to
re-derive the map, and re-deriving it silently is how a speed ramp turns into a
different move. Clear the remap, cut, re-apply.

## Compositions

A composition is a group saved as a reusable rig with named parameters.
`list_compositions` reports what is available, `get_composition` shows one
rig's parameters and their defaults, and
`{"op":"insert_composition","composition_id":"lower-third","startMs":4000,"params":{"name":"Ada"}}`
instantiates it into the document with fresh clip ids. Use parameter names
returned by `get_composition`; `name` here is an example.

Bundled examples include `title-card`, `lower-third`, `caption-bar`,
`callout`, `cta-end-card`, `logo-sting`, `title-slam`, `word-cards`,
`window-frame`, and `number-ticker`. Use `list_compositions` for the
templates available in the current workspace.

Insert first, then override `params`. The rig's timing and motion are already
balanced against each other, and rebuilding it from bare clips throws that
away. Edit the instantiated clips only where the brief actually differs.

When a group should be reused, `save_composition
{timeline_id, group_target, name, params}` extracts it as a composition.
`params` map names to typed defaults and JSON pointers into child fields.
`insert_composition` remaps the group and child clip IDs, including internal
layout and animation links, while preserving references to clips outside the
composition.

## Cutting to the beat

`detect_audio_events` on the music clip reports onsets and a tempo. Its
`onsets.times` are in **seconds** and the ops take milliseconds, so multiply by
1000. Read the tempo's `reliable` flag before building a grid from `bpm`:
speech and room tone produce a confident-looking number from nothing.

`{"op":"set_markers_from_beats","onsets_ms":[0,500,1000],"count":3}` lays the
grid down so you can see it. `{"op": "snap_to_beats", "targets": "all",
"tolerance_ms": 60, "mode": "start", "action": "move"}` pulls clip edges onto
it. Either takes `onsets_ms` or a `bpm` with an `offset_ms`.

The default 60ms tolerance is about two frames at 30fps: close enough that a
cut reads as on the beat, tight enough that it will not drag an edge to a beat
it was never near. Widen it only when the grid is loose, because a large
tolerance moves cuts you meant to leave alone. `snap_to_beats` reports every
target, including the ones no beat was in reach of, with the reason.

`action: "move"` slides the clip and keeps its length, which shifts everything
downstream. `action: "trim"` changes the length and leaves the neighbours
where they are. Move a title that has to land on a hit; trim a picture clip
whose out point has to meet the next shot.

## Validate the output

Two checks, and they answer different questions.

**`validate_timeline`** answers "is this document sound": unknown animation
presets and transitions, fades and cuts longer than the clip carrying them,
clips on tracks the document lacks, overlapping clips, clips shorter than a
frame, in/out points that cannot render, duplicate ids. Run it after every batch
of edits.

It also names the motion failures that used to be yours to remember. Each
finding carries a stable `code`; these are the ones that mean the picture will
not perform the motion you wrote:

| Code | Severity | What to do about it |
|---|---|---|
| `parent_cycle` | error | A `parentId` chain loops, so the group cannot be resolved at all. Break the loop |
| `matte_source_missing` | error | The matte names a clip the document lacks, or itself. The layer draws unmatted, showing everything the matte was there to hide |
| `time_remap_not_monotonic` | error | `t` repeats or goes backwards. `sourceMs` may descend — that is a reverse — but `t` may not |
| `custom_animation_invalid` | error | A stored `preset: "custom"` animation has unusable baked numeric curves and no style track or text animator to render. Re-bake its curves or add a valid typed track |
| `animation_style_invalid` | error | A style target has no matching clip style, a path cannot morph, a color cannot parse, or a glyph track lacks text stagger. Fix the target or the clip style |
| `animation_exceeds_clip` | warning | The window does not fit the clip after its delay, so the motion is clamped or never runs. Shorten `durationMs`, cut the delay, or lengthen the clip |
| `stagger_compressed` | warning | The units did not fit, so the per-unit offset was shrunk. The line lands faster and flatter than you wrote it. Shorten the per-unit `durationMs` or give the clip more time |
| `typewriter_not_staggered` | warning | A `typewriter` is stored with a plain `durationMs` and no `stagger`. Nothing draws for that time, then the whole text appears with no caret. Store `durationMs: 1` with a `character` stagger, or apply the preset again through `animate_clip` |
| `animation_holds_rest_before_window` | warning | A custom `out` curve starts away from the channel's rest value after clip start. An `out` does not apply before its window, so the frames before it show the rest value (a gauge drawn from `trimEnd: 0` shows a full ring). Start the window at clip start. For a `trim`, `position` or `anchor` curve, you can instead set the clip's own value to the first keyframe |
| `replace_curves_overlap` | warning | Two animations drive one absolute channel (`positionX/Y`, `anchorX/Y`, `trimStart/End`) at once. The last in document order wins and the other is discarded. Separate them in time or fold them into one curve |
| `text_backing_unproven` | warning | Text draws over picture with no `background`, `stroke` or shape behind it, so nothing decides whether it reads. Preview the frame and look, or give it a plate |
| `text_illegible` | warning | Type under 2.5% of frame height, or under a 3:1 contrast ratio against its own `background` plate or a full-frame shape behind it. Raise `fontSizePx`, darken the scrim, or add a `stroke` |
| `unknown_easing` | warning | Outside the grammar, so it eases linearly. Check the spelling: `easeOut`, not `ease-out` |
| `unknown_transition` | warning | This build cannot draw that `type` or `direction`; it cross-fades left instead. Pick one from the table above |
| `unknown_effect` | warning | This build cannot apply that effect; the layer draws ungraded |
| `unknown_shape_kind` | warning | No geometry for that `shapeStyle.kind`, so the shape draws nothing. A scrim that vanished is usually this |
| `transition_exceeds_duration` | warning | The cut is longer than the clip carrying it. Shorten the transition or lengthen the clip |
| `parent_missing`, `parent_not_group` | warning | The `parentId` names nothing, or names a clip that is not a group. The child renders unparented, losing the group's transform, opacity and window |
| `mask_path_invalid` | warning | The `kind` or path `d` cannot rasterize, so the layer draws unmasked and the whole picture shows through |
| `layer_cap_exceeded` | warning | More video clips overlap at that instant than the compositor draws; the ones on lower tracks are dropped |
| `font_not_portable` | warning | The family is not one NodeTool ships, so every host resolves it against its own installed fonts and the editor and the render can differ. Pick a bundled family for anything you hand back |
| `field_stripped` | warning | A field the schema drops, lost on the next save. Usually a newer build wrote it; re-author it in this build's grammar |

The contrast half refuses to guess: a colour it cannot parse, a translucent
plate or gradient-filled type produces no contrast finding. Type over picture
with no plate at all is the case it can name without measuring, and it says so
as `text_backing_unproven`. Either way a silent `text_illegible` is not a pass
— that is what the frames are for.

**`preview_timeline_frame`** answers "what does it look like". It composites
the real frame — every track layered in order, transforms and opacity applied,
animations sampled, transitions part way through, text and shapes drawn — at
the timecodes you name. It needs no browser, no GPU and no open editor.

```json
{"timeline_id": "<id>", "times_ms": [1200, 1450, 3000]}
```

`range {from_ms, to_ms, count}` samples evenly across a span instead of naming
each timecode — the way to watch a whole entrance rather than guess three
points inside it. `sheet: true` tiles every frame into one labelled contact
sheet, so a sweep is one image to read instead of a handful of handles.

It returns an image handle per timecode; call `view_image` on the ones you need
to see. Beside each frame it lists the layers top of the stack first, with the
opacity, blend mode and wipe progress each one resolved to — often enough to
diagnose a problem without looking at a pixel.

**Sample the middle of a motion, not its ends.** The endpoints are the states
you already know: before an entrance the clip is absent, after it the clip is
at rest. A 400ms fade-in starting at 1000ms tells you nothing at 1000ms or
1400ms and everything at 1200ms. For each animation you added, preview at:

- the midpoint of the entrance,
- a held moment between the in and out,
- the midpoint of the exit,
- and, for staggered text, a point after the first word lands but before the
  last does — the frame where half the line is on screen is the one that
  reveals a stagger that is too slow.

What the frames catch that a validator cannot: text over a busy or same-colored
plate, a lower-third under the wrong element because two tracks are the wrong
way round, a title that has slid outside the frame, a stagger still finishing
when the clip ends, a scrim covering the face it was supposed to sit beside, an
element that never appears because its clip is on an audio track.

Each frame carries `degraded` entries for a difference the Canvas 2D host
could not draw, such as a missing scratch surface, a hard mask edge, or an
unsupported perspective transform. Read the actual entries before deciding
which part of the frame needs a GPU render. Known clip effects have CPU passes.

Read the `skipped` field on any layer that drew nothing — it says whether the
clip is still `draft`, its asset would not read, or the source had no frame at
that time. A missing picture is usually an unrendered clip, not a motion bug.

`effects_not_applied` names enabled effect types the Canvas 2D compositor does
not recognize. A known effect such as chroma key, vignette, sharpen, or LUT
should render in the frame preview; a missing scratch surface instead appears
in `degraded`.

## The render loop

Change one thing, preview the same timecodes, compare. When motion is wrong,
the order to check is: is the element on screen at all (layer present in the
report), is it in the right stacking position (`z_index`), is it at the right
opacity (`opacity`), is it in the right place (look at the frame). Working down
that list beats re-authoring the animation.

`compare_timeline_frames {a, b, times_ms | range}` measures what actually moved
between two documents or two versions. Run it after a change the user did not
ask for (a restructure, a composition insert, a snap pass) so you can say
which frames it touched instead of hoping it touched none.

Before calling the cut done, render it. `render_timeline` with a
`preview_scale` below 1 while you are still iterating, then once at full size.
The preview answers what one timecode looks like; the render answers whether
the file plays.

A whole-document rewrite goes through `set_timeline_document`, which validates
before it writes and snapshots what it replaces. Name that snapshot
(`snapshot_name: "before the title pass"`) so the version list says what you
were about to do. For anything smaller, `create_timeline_version` first and
`edit_timeline` after.

Stop when the motion is right, and say what you animated.
