---
name: motion-background
description: Build an ambient backdrop on a NodeTool timeline using shape gradients, procedural generator effects, slow loops, or generated video. Use for title cards, hero beds, end cards, lower-third plates, and quiet loops behind a subject.
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
| Flat or gradient wash | One full-frame `rect` shape with `fillStyle` linear or radial | Shape clips do not count against the video layer cap |
| Soft mesh or conic wash | One full-frame shape with a `generator` effect, `mode: "meshGradient"` or `"conicGradient"` | One procedural effect, no model call |
| Shaped colour blobs | Radial-filled `ellipse` clips, low opacity, blurred | More control over each blob's motion |
| Noise, fractal, particles, light leak, grid | One full-frame shape with the matching `generator` mode | Procedural and seedable |
| Drifting texture | An image clip with a `kenBurns` animation | Outside the video layer cap |
| Smoke, ink, or clouds | A generated video bed, looped | One video layer and a model call |
| Colour cycle | Any of the above plus a `hueShift` loop | An additional grade |

At most **eight video layers** composite at once, resolved from the lowest track
index. Text, shape and image clips are not counted, so a bed built from shapes
costs nothing in that budget. Nine overlapping video clips means the bottom one
silently does not draw, reported as `layer_cap_exceeded`.

## A procedural bed

Add a full-frame shape and apply a generator effect to it. Modes are `noise`,
`fractal`, `conicGradient`, `meshGradient`, `gradientField`, `particles`,
`lightLeak`, and `gridPattern`. `colorA` and `colorB` set the two colours;
`scale`, `amount`, `angle`, `time`, and `seed` shape the field. For movement,
set `animate: true`, which samples the current timeline time into the effect.
Keep a fixed `seed` for repeatable frames. This clock keeps moving; it does not
make the procedural field wrap at the clip boundary. For a seamless loop, use
a wrapping clip animation or match the endpoints in a rendered loop.

```json
{"op": "set_effects", "target": "Bed", "effects": [
  {"type": "generator", "mode": "meshGradient", "enabled": true,
   "colorA": "#10233c", "colorB": "#ec6b45", "scale": 6,
   "amount": 0.6, "seed": 9, "animate": true}]}
```

For a dark wash that bands, put a fixed-seed `stylize` `dither` after the
generator or gradient in the effect list. Dither breaks up 8-bit steps but
cannot restore precision lost in the source. `color-motion` covers this look.

## A mesh from shapes

For individual moving blobs, stack radial fills over a base. Each ellipse is
its own clip on an overlay track, at 30–60% opacity, with a `blur` effect wide
enough that no edge reads:

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

For smoke, ink, or clouds that the procedural modes cannot draw, generate video.
Use `find_model` with `text_to_video`, then `generate_video`,
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
