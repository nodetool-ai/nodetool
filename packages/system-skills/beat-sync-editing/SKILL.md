---
name: beat-sync-editing
description: Cut a NodeTool timeline to music and shape its pacing — detect the beat grid, place cuts on phrases, pick a cut type, build speed ramps with time remap, and give the piece an arc. Use when clips should land on the music, when pacing drags or feels choppy, when a hit needs impact, or when transitions feel arbitrary. Not for what each shot contains.
---

# Beat-Sync Editing → cuts, rhythm and retiming

Where a cut lands matters as much as what is on screen. This turns a track and a
brief into millisecond cut points on the timeline.

`motion-direction` sets the energy; this turns it into a grid and an arc.
`motion-graphics` carries the op contract for the calls named here.

## Get the grid from the audio, not from arithmetic

`detect_audio_events` on the music clip reports onsets and a tempo.

- `onsets.times` are in **seconds**. Every timeline op takes milliseconds, so
  multiply by 1000. This is the single most common mistake here.
- Read `tempo.reliable` before you build anything off `bpm`. Speech and room
  tone produce a confident-looking number from nothing. Unreliable means use the
  onsets directly.
- The first onset is the grid's offset. A grid anchored at 0 instead of beat one
  puts every cut a few frames early — the edit that feels "almost right".

With a reliable tempo:

```
ms_per_beat = 60000 / bpm
frames_per_beat = (60 / bpm) × fps          # fps comes from get_timeline
```

At 120 BPM: 500ms a beat, 15 frames at 30fps, a 2000ms bar. Round each
**cumulative** beat, never the step, or the grid drifts over a long edit.

Lay the grid down so you can see it, then pull edges onto it:

```json
{"op": "set_markers_from_beats", "onsets_ms": [0, 500, 1000], "count": 32}
{"op": "snap_to_beats", "targets": "all", "tolerance_ms": 60,
 "mode": "start", "action": "move"}
```

Either takes `onsets_ms`, or a `bpm` with an `offset_ms`. The 60ms default
tolerance is about two frames at 30fps — close enough to read as on the beat,
tight enough not to drag an edge onto a beat it was never near. `snap_to_beats`
reports every target including the ones nothing was in reach of, with the reason.
`action: "move"` keeps the clip's length and shifts what follows; `action:
"trim"` changes the length and leaves the neighbours alone. Move a title that has
to land on a hit; trim a picture clip whose out point has to meet the next shot.

## Cut on phrases, not on beats

A cut on every beat is relentless and the viewer fatigues by beat eight. Cut on
2, 4 or 8 beats, and accent on the eighth grid sparingly.

| Personality | Cut every | Transition family | Retime |
|---|---|---|---|
| Playful | 4 beats, syncopated accents | Hard cut, occasional `push` | Light ramps |
| Premium | 8–16 beats, long holds | Hard cut, occasional `crossfade` | Slow, smooth |
| Corporate | 8 beats, steady | Hard cut only | None |
| Energetic | 1–2 beats at the peak | Hard cut, `zoom`, `push` | Aggressive, on the beat |

Put the single biggest visual on the drop. One piece, one peak.

## Shape an arc

Uniform pacing reads as flat regardless of content.

| Phase | Cut every | Shot length | Note |
|---|---|---|---|
| Establish | 8–16 beats | Longest | Set the place, let it breathe |
| Develop | 8 → 4 beats | Shortening | Accelerate to build |
| Climax | 1–2 beats | Shortest | The drop, the biggest visual, the ramp |
| Resolve | One long hold | Longest | The end card breathes after the peak |

## Hide the seam

A cut is invisible when motion carries the eye across it. Cut during a movement,
and match its direction and speed across the cut. For graphics, cut at a
transform peak — mid-travel, not at rest.

Default to the hard cut: two clips on the same track, meeting exactly. Reach for
anything else only when it is motivated.

| Cut | How, on the timeline | Reach for it when |
|---|---|---|
| Hard cut | Adjacent clips, no overlap, no `set_transition` | Nine cuts in ten |
| Match cut | Hard cut where both frames share a shape, position or motion vector | Two shots rhyme; the strongest move in motion design |
| Crossfade | `set_transition` `crossfade` on the incoming clip, clips overlapped by at least its `durationMs` | Two shots of the same scene |
| Dip | `dipToColor` with your own `color` | A chapter break |
| Wipe / push / slide | Those types with a `direction` naming the edge the incoming clip arrives from | A graphic feel, or lateral energy |
| Zoom | `zoom` | Pushing into the next beat |
| J-cut | The next clip's audio clip starts 4–12 frames before its picture, on its own audio track | Dialogue, reveals: it pulls the viewer forward |
| L-cut | The current clip's audio runs 12–24 frames under the next picture | Scene changes, ambience |
| Whip | A short `offsetX` move plus a `blur` effect either side of a hard cut | Hype, a scene jump |

Two things the engine does whether you asked or not:

- Two clips on one track whose times overlap dissolve across the overlap with no
  call at all. **An accidental overlap is an accidental dissolve.** When a cut
  looks soft where you wanted it hard, check `startMs` and `durationMs` first.
- A transition plays over the incoming clip's head against whatever is beneath
  it. With no overlap there is nothing under it and it reads as a fade from
  black.

J and L cuts are built by splitting picture and sound onto separate clips, not
by a transition: the shot's audio twin already sits on its own audio track after
an assemble, so move that clip rather than the picture.

## Speed ramps

`set_time_remap` maps timeline time onto source time. `t` runs 0..1 over the
clip's own window, must start at 0, end at 1 and ascend; `sourceMs` says which
millisecond of the source plays there. Descending `sourceMs` is a reverse, a flat
pair is a freeze.

Ramp into a hit and snap out, with the slowest frame on the beat. On a 2000ms
clip whose impact sits at 1200ms:

```json
{"op": "set_time_remap", "target": "Shot 3", "timeRemap": {"keyframes": [
  {"t": 0, "sourceMs": 0},
  {"t": 0.5, "sourceMs": 900, "easing": "easeIn"},
  {"t": 0.6, "sourceMs": 1000, "easing": "easeOut"},
  {"t": 1, "sourceMs": 2400}]}}
```

Between 0.5 and 0.6 the source advances 100ms across 200ms of timeline: quarter
speed on the hit. `t` that repeats or goes backwards is
`time_remap_not_monotonic`, an error. `split_clip` and `trim_clip` refuse a
remapped clip, because re-deriving the curve silently is how a ramp becomes a
different move — clear the remap, cut, re-apply.

`speedMultiplier` on `set_clip_params` is the flat alternative: one rate for the
whole clip, no curve. Use it when nothing needs to ramp.

## The plan, before the calls

Write the cut down before editing, in the units the ops take:

- Track spec: `bpm`, `fps`, the first onset in ms, the drop in ms, ms per beat.
- The four phases with their ms ranges and target shot length.
- Every cut as an absolute ms, its clip, and its cut type.
- Audio offsets in ms for each J and L cut.
- Each ramp as its `t` / `sourceMs` keyframes.
- The marker list you will pass to `set_markers_from_beats`.

## Check it

`validate_timeline` after every batch: it catches overlapping clips, a
transition longer than the clip carrying it, and clips shorter than a frame.

Then look and listen. `preview_timeline_frame` at the ms either side of a cut
says whether the seam is where you think it is; `analyze_audio` on the music
confirms the grid you built matches the file. Before calling the cut done,
`render_timeline` — a preview answers what one timecode looks like, a render
answers whether it plays.

## Common mistakes

| Symptom | Cause | Fix |
|---|---|---|
| Frantic | A cut on every beat | Cut on 2, 4 or 8 beat phrases |
| Almost on beat | Grid anchored at 0, ignoring the first onset | Anchor to the onset, in ms |
| Drift over a long edit | Rounding each step | Round each cumulative beat |
| Jarring cut | Placed at rest, between motions | Cut mid-motion, match direction |
| Soft where it should be hard | Overlapping clips on one track | Fix `startMs` and `durationMs` |
| Transition fades from black | Nothing beneath the incoming head | Overlap the clips by the transition's `durationMs` |
| Flat | Uniform pacing | Establish, develop, climax, resolve |
| Nothing lands | No single peak | One biggest visual, on the drop, then a hold |
