---
name: motion-graphics
description: Animate typography, clips and transitions on a NodeTool timeline, and check the result by looking at rendered frames. Use for title cards, kinetic text, lower-third motion, clip entrances and exits, transitions between shots, and track layering. Not for writing the copy, cutting the picture, or rendering video.
---

# Motion Graphics → Timeline Agent

Motion is timed, layered and checked. Author animations with `edit_timeline`,
then look at the frames with `preview_timeline_frame`. A change you have not
looked at is not done.

`caption-titles` decides what text says and when it appears. This skill decides
how it moves.

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
`cycles` 1–12 default 4), `bounce` (600ms; `height` 0–0.3, default 0.05).

`loop` — `kenBurns` (3000ms; `zoom` 0–1 default 0.12, `direction` in/out,
`driftX`/`driftY` −0.2–0.2), `float` (3000ms; `amplitude` 0–0.2), `breathe`
(3000ms; `intensity` 0–0.3), `rotate` (3000ms; `direction` cw/ccw).

Easing: `linear`, `easeIn`, `easeOut`, `easeInOut`, `easeOutBack`,
`easeOutElastic`, `easeOutBounce`. Unset means the preset's own default, and
failing that the role's — `in` gets `easeOut`, `out` gets `easeIn`. That
default is almost always right: an entrance decelerates into place, an exit
accelerates away. Reach for `easeOutBack` or `easeOutElastic` only when the
piece is playful; they read as cheap on anything corporate.

Call `list_animation_presets` (or `{"op": "list_animation_presets"}`) when you
need the exact param list rather than this summary — the catalog is the
authority.

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

| Code | What to do about it |
|---|---|
| `animation_exceeds_clip` | The window does not fit the clip after its delay, so it is clamped — or dropped. Shorten `durationMs`, cut the delay, or lengthen the clip |
| `stagger_compressed` | The units did not fit, so the per-unit offset was shrunk. The line lands faster and flatter than you wrote it. Shorten the per-unit `durationMs` or give the clip more time |
| `replace_curves_overlap` | Two animations drive one absolute channel (`positionX/Y`, `anchorX/Y`, `trimStart/End`) at the same time. Those replace rather than compose, so one is discarded — separate them in time or fold them into one curve |
| `text_illegible` | Type under 2.5% of frame height, or under a 3:1 contrast ratio against its own `background` plate or a full-frame shape behind it. Raise `fontSizePx`, darken the scrim, or add a `stroke` |
| `unknown_easing` | Outside the grammar, so it eases linearly. Check the spelling: `easeOut`, not `ease-out` |
| `unknown_transition`, `unknown_effect` | This build cannot draw it; it cross-fades or draws ungraded. Pick one from the catalog |
| `parent_missing`, `parent_not_group`, `parent_cycle` | The child renders unparented, losing the group's transform, opacity and window |
| `matte_source_missing` | An error: the layer draws unmatted, showing everything the matte was there to hide |
| `mask_path_invalid` | The layer draws unmasked, so the whole picture shows through |
| `layer_cap_exceeded` | More video clips overlap at that instant than the compositor draws; the ones on lower tracks are dropped |
| `time_remap_not_monotonic` | An error: `t` must ascend. `sourceMs` may descend — that is how a reverse is written |

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

## Iterate

Change one thing, preview the same timecodes, compare. When motion is wrong,
the order to check is: is the element on screen at all (layer present in the
report), is it in the right stacking position (`z_index`), is it at the right
opacity (`opacity`), is it in the right place (look at the frame). Working down
that list beats re-authoring the animation.

Stop when the motion is right. Rendering video is not this skill's job; hand
back the timeline and say what you animated.
