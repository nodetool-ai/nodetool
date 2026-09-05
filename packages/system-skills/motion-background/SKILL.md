---
name: motion-background
description: Build an ambient looping backdrop on a NodeTool timeline — gradient beds from shape clips, slow loop animations, layered drift, and a generated video bed — that moves without stealing focus. Use for a title card backdrop, a hero bed behind text, an end card, a lower-third plate, or a loop behind a talking head. Not for the content in front of it.
---

# Motion Background → the bed

A background that draws attention has failed. Slow, low contrast, looping with
no visible join, and cheap enough that the picture in front of it still
composites.

`motion-graphics` carries the op contract for the calls named here.
`color-motion` chooses the palette the bed is built from, and `motion-curves`
writes the loop when no wrapping preset holds the seam.

## Pick the cheapest thing that reads

| Look | Build it from | Cost |
|---|---|---|
| Flat or gradient wash | One `rect` shape clip filling the frame, `fillStyle` linear or radial | Free; shape clips do not count against the video layer cap |
| Soft mesh | Three or four `ellipse` shape clips with radial fills, low opacity, blurred | Cheap, and the closest thing to a mesh gradient here |
| Drifting texture | An image clip with a `kenBurns` loop | One video layer |
| Organic motion | A generated video bed, looped | One video layer, and a model call |
| Colour cycle | Any of the above plus a `hueShift` loop | Free on top |

At most **eight video layers** composite at once, resolved from the lowest track
index. Text, shape and image clips are not counted, so a bed built from shapes
costs nothing in that budget. Nine overlapping video clips means the bottom one
silently does not draw, reported as `layer_cap_exceeded`.

## A mesh, from shapes

Stack radial fills over a base. Each ellipse is its own clip on its own overlay
track, at 30–60% opacity, with a `blur` effect wide enough that no edge reads:

```json
{"op": "add_shape_clip", "shape": {"kind": "ellipse",
 "x": 0.05, "y": 0.1, "width": 0.6, "height": 0.7,
 "fillStyle": {"type": "radial", "stops": [
   {"offset": 0, "color": "#5b8cff"}, {"offset": 1, "color": "#5b8cff00"}]}},
 "durationMs": 12000}
```

```json
{"op": "set_effects", "target": "Ellipse", "effects": [{"type": "blur", "radius": 120}]}
```

Then give each blob a different `loop`: `float` with `amplitude` 0.02–0.05,
`breathe` at `intensity` 0.03–0.08, and cycle lengths that do not divide each
other — 9000, 13000, 17000ms — so the composite never visibly repeats.

`blendMode` `screen` or `add` on a blob over a dark base builds light rather than
covering it; `multiply` or `soft-light` deepens instead. That choice matters more
than the fill colours.

## Loops that actually loop

`float`, `breathe`, `rotate` and `hueShift` are built to wrap: they start and end
at the same value, so `durationMs` is a period and the seam is invisible. A
custom loop curve must do the same — the value at `t: 1` has to equal the value
at `t: 0` or the bed jumps every cycle.

`kenBurns` is the exception: it is a one-shot across the whole clip, holding at
its end, so it does not repeat and its `durationMs` is ignored. On a long bed a
drift from `kenBurns` finishes and then sits still. For continuous drift over a
long clip use `float` with a long period instead.

Periods that read as ambient: 8000–30000ms. Anything under about 5000ms reads as
a screensaver, and text in front of it becomes hard to hold.

## Keep it behind

- Background sits on the **highest** track index, because the lowest draws on
  top. A bed that covers the picture is a track-order mistake, not an opacity
  one.
- Contrast: pull it down with a `color` effect at `saturation` 0.5–0.7 and
  `brightness` slightly negative before touching opacity. A desaturated bed
  reads as depth; a faded one reads as a mistake.
- Amplitude: nothing in the bed should travel more than about 3% of the frame,
  or the eye starts tracking it.
- Give the foreground a scrim if the bed's bright regions cross the type: a black
  `rect` shape at 40–60% opacity on a track index between the bed and the text.
  `validate_timeline` reports `text_illegible` for what it can measure, and says
  nothing about gradients — look at the frame.

## A generated bed

For organic motion nothing on the timeline can draw — smoke, ink, particles,
clouds — generate it. `find_model` with `text_to_video`, then `generate_video`,
then `add_media_clip` with the returned `asset://` reference. The `find_model`
result names a `prompting_skill` for the line it picked; load it, because each
line wants the prompt shaped differently. Whatever the line, prompt for slow,
even motion with no cuts and no subject; a bed with an event in it is a shot,
not a bed. On a line that writes native audio (Seedance 2, Veo 3, MiniMax H3,
Kling 2.6 and later) the bed arrives with a soundtrack: either brief it as room
tone and keep it, or mute the clip under the track you meant to use —
`video-audio-continuity` is the rule for which.

A generated clip does not loop. Cover a longer sequence by duplicating it and
crossfading the joins: overlap the copies by 800–1500ms on one track, which
dissolves with no call at all, or `set_transition` `crossfade` on the incoming
copy to pin the length.

## Reduced motion, and knowing when to stop

A bed exists to sit under something. Before adding a second idea to it, check
whether the first one is doing anything at all — a drift too slow to see is
budget spent on nothing, and one too fast is the reason nobody read the headline.
One idea, one amplitude, one period family.

## Check it

- `preview_timeline_frame` with a `range` across a full cycle and `sheet: true`,
  which is how you see whether a loop breathes evenly or lurches. Sampling three
  timecodes will not show a seam.
- The same sweep with the foreground on, to confirm the type still reads at every
  point in the cycle rather than only where you happened to look.
- `render_timeline` at a low `preview_scale` while iterating. A bed is judged
  over seconds, and a still cannot tell you whether it is calm.
