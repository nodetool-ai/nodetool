---
name: motion-graphics
description: Animate typography, clips and transitions on a NodeTool timeline, and check the result by looking at rendered frames. Use for title cards, kinetic text, lower-third motion, clip entrances and exits, transitions between shots, and track layering. Not for writing the copy, cutting the picture, or rendering video.
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

Two are neighbours rather than layers: `caption-titles` decides what text says
and when it appears, and the board skills (`explainer-storyboard`,
`commercial-beat-sheet`, `launch-commercial`, `music-video-treatment`) decide
the shots before there is a timeline to animate.

## Read before you animate

Call `get_timeline` first. You need the sequence's `fps`, `width`, `height`,
the track list with each track's `index` and `type`, and every clip's
`startMs`, `durationMs`, `mediaType` and existing `animations`. Animate nothing
until you have clip ids from the document — never a guessed one.

Snapshot with `create_timeline_version` before your first edit. Motion work is
iterative and a wrong `mode: "replace"` wipes animations somebody wrote.

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

`emphasis` — `pulse` (600ms; `intensity` 0–0.5, default 0.06), `flash` (400ms;
`intensity` 0–1, default 0.6), `shake` (600ms; `intensity` 0–0.2 default 0.02,
`cycles` 1–12 default 4), `bounce` (600ms; `height` 0–0.3, default 0.05),
`squash` (500ms, easeOutBack; `amount` 0–0.5, default 0.12).

`loop` — `kenBurns` (3000ms; `zoom` 0–1 default 0.12, `direction` in/out,
`driftX`/`driftY` −0.2–0.2), `float` (3000ms; `amplitude` 0–0.2), `breathe`
(3000ms; `intensity` 0–0.3), `rotate` (3000ms; `direction` cw/ccw),
`hueShift` (3000ms; `direction` forward/reverse).

Easing: `linear`, `easeIn`, `easeOut`, `easeInOut`, `easeOutBack`,
`easeOutElastic`, `easeOutBounce`. Unset means the preset's own default, and
failing that the role's — `in` gets `easeOut`, `out` gets `easeIn`. That
default is almost always right: an entrance decelerates into place, an exit
accelerates away. Reach for `easeOutBack` or `easeOutElastic` only when the
piece is playful; they read as cheap on anything corporate.

Call `list_animation_presets` (or `{"op": "list_animation_presets"}`) when you
need the exact param list rather than this summary — the catalog is the
authority.

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
channel table and nine worked recipes. Then `{"role": "in", "preset": "custom",
...}` carrying exactly one of

- `curves` — `[{property, keyframes: [{t, value, easing?}]}]`, with `t` running
  0..1 across the animation's window. `list_animation_presets` reports the
  animatable properties.
- `code` — a JavaScript body baked into curves once, host-side, at author time.
  Nothing evaluates at render.

Add `mask` when a curve drives `wipeProgress`; without it the wipe has no edge
to run against.

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

### Durations that read

- An entrance under 200ms reads as a hard cut; over 800ms it drags.
  300–500ms covers most work.
- `in` + `out` together must fit inside the clip with hold time left over. A
  3000ms title with a 500ms in and a 500ms out holds for 2000ms. Below about
  1000ms of hold, the element never settles and looks like a glitch.
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

Each word runs the full animation for `durationMs`, offset `offsetMs` from the
previous. `from` picks which word leads: `start` (default), `end`, or `center`.
Words are whitespace-separated, and a stagger needs at least two of them —
below that it compiles as an ordinary block animation.

The span is `durationMs + offsetMs × (words − 1)`, halved for `from: "center"`
(the middle word leads and both edges run last, so the largest delay is half
the span). Six words at `offsetMs: 200` with a 500ms preset span 1500ms.

**A span that does not fit the clip is silently compressed, not cut off.** The
engine shrinks the per-step offset — never the per-word duration — so the last
word still completes inside the clip. Ask for 200ms of offset on a clip with
room for 60ms and you get 60ms: every word still animates, the motion is
simply tighter and more simultaneous than you wrote, and nothing reports it.
This is the most common reason staggered type "doesn't look staggered". Work
out the span, compare it against `durationMs` minus any `delayMs`, and if it
does not fit, lengthen the clip or lower the offset yourself rather than
letting the clamp choose for you.

`loop` staggers are the exception: the offset is a phase shift, so it is
neither stretched nor clamped.

Offsets that read:

- 60–100ms reads as one phrase arriving with texture.
- 150–250ms reads as words landing individually — right for a short punchline,
  wrong for a sentence someone has to read.
- Stagger a line of five words or fewer. Longer, and the reader is still
  waiting for the end of the sentence when it should already be legible.

Stagger applies only to text clips and only to transform and opacity motion.
`wipe`, `blur` and `colorFade` stay block-level even with a stagger set — the
mask and effect curves are per-layer, not per-word. A stagger on a media clip
is ignored, not an error, so a "why isn't it staggering" bug is usually a clip
that is not `mediaType: "text"`.

Type sizes are authored against the sequence resolution: `fontSizePx` on a
1920×1080 sequence means the same thing at any preview width.

## Groups

`{"op": "add_group", "name": "Lower third", "startMs": 4000, "durationMs":
4000, "children": [...]}` makes a clip with no media whose transform, opacity
and window every clip naming it inherits. `{"op": "set_parent", "target":
"Name plate", "parentId": "<group id>"}` adopts a clip that already exists;
`"parentId": null` releases it, and a cycle is refused.

Rig a lower third this way: scrim, name, role, each on its own overlay track,
all three parented to one group. Then animate the **group**. One `slide` in and
one `fade` out on the group moves the assembly together and keeps the parts
locked to each other, where animating them separately is three chances to
drift.

Children keep their own tracks, so grouping does not change what covers what.
The group's opacity multiplies into each child, and that is all a plain group
does — but a group carrying an effect or a blend mode other than `normal`
composites its children into one surface first, so the effect runs on the
assembled picture rather than once per child. Put a `glow` on the group for the
whole look, on a child for that child alone.

`parent_missing`, `parent_not_group` and `parent_cycle` all mean the child
renders unparented, losing the group's transform, opacity and window.

## Transitions

A transition is between clips, not on one clip. It is authored on the
**incoming** clip and resolved for both: the compositor finds the clip beneath
it on the same track and gives that one the complementary half of the cut.

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

`direction` on `wipe`, `push` and `slide` names the **edge the incoming clip
arrives from**, the same vocabulary the `wipe` animation uses. `easing` takes
the full grammar — a named id, `cubic-bezier(...)` or `spring(...)`.

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

`{"op": "set_effects", "target": "Shot 2", "effects": [{"type": "glow", ...},
{"type": "vignette", ...}]}` replaces the whole chain and applies it in the
order given; an empty list clears it. The types are `color`, `blur`, `glow`,
`dropShadow`, `vignette`, `sharpen`, `chromaKey`, `curves`, `levels` and
`liftGammaGain`. One this build cannot apply reports `unknown_effect` and the
layer draws ungraded.

The frame preview is a 2D compositor, not the GPU one. It maps color and blur
onto the canvas filter and has no equivalent for `chromaKey`, `vignette`,
`sharpen`, or the `temperature` and `tint` fields of a `color` effect, so it
names them in `effects_not_applied` instead of dropping them quietly. Motion is
unaffected. Judge those looks from a render, not from a previewed frame.

## Time remap

`{"op": "set_time_remap", "target": "Shot 3", ...}` maps timeline time onto
source time with keyframes. `t` must ascend; `sourceMs` may descend, and that
is how a reverse is written. A repeated or backwards `t` is
`time_remap_not_monotonic`, an error.

`split_clip` and `trim_clip` refuse a remapped clip. Both would have to
re-derive the map, and re-deriving it silently is how a speed ramp turns into a
different move. Clear the remap, cut, re-apply.

## Compositions

A composition is a group saved as a reusable rig with named parameters.
`list_compositions` reports what is available, `get_composition` shows one
rig's parameters and their defaults, and `{"op": "insert_composition",
"composition_id": "lower-third", "startMs": 4000, "trackId": "<id>", "params":
{...}}` instantiates it into the document with fresh clip ids.

Six ship: `title-card`, `lower-third`, `caption-bar`, `callout`,
`cta-end-card`, `logo-sting`.

Insert first, then override `params`. The rig's timing and motion are already
balanced against each other, and rebuilding it from bare clips throws that
away. Edit the instantiated clips only where the brief actually differs.

Once the user approves a look you built by hand, `save_composition
{timeline_id, group_target, name, params}` extracts that group as a
composition you can insert again. Extract on approval, not on the first
version.

## Cutting to the beat

`detect_audio_events` on the music clip reports onsets and a tempo. Its
`onsets.times` are in **seconds** and the ops take milliseconds, so multiply by
1000. Read the tempo's `reliable` flag before building a grid from `bpm`:
speech and room tone produce a confident-looking number from nothing.

`{"op": "set_markers_from_beats", "onsets_ms": [...], "count": 32}` lays the
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
| `animation_exceeds_clip` | warning | The window does not fit the clip after its delay, so the motion is clamped or never runs. Shorten `durationMs`, cut the delay, or lengthen the clip |
| `stagger_compressed` | warning | The units did not fit, so the per-unit offset was shrunk. The line lands faster and flatter than you wrote it. Shorten the per-unit `durationMs` or give the clip more time |
| `replace_curves_overlap` | warning | Two animations drive one absolute channel (`positionX/Y`, `anchorX/Y`, `trimStart/End`) at once. The last in document order wins and the other is discarded. Separate them in time or fold them into one curve |
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
plate, gradient-filled type or a backdrop it cannot prove is behind the text
produces no finding at all. A silent `text_illegible` is not a pass — that is
what the frames are for.

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

Read the `skipped` field on any layer that drew nothing — it says whether the
clip is still `draft`, its asset would not read, or the source had no frame at
that time. A missing picture is usually an unrendered clip, not a motion bug.

`effects_not_applied` names effect types the frame preview cannot draw —
chroma key, vignette, sharpen. Motion is unaffected; do not judge those looks
from a previewed frame.

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
