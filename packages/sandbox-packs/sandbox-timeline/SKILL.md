---
name: sandbox-timeline
description: Author a motion-graphics timeline as code: scenes of shapes, text and images, keyframed in frames, saved in one call
---

# Timelines as code

Specifier: `@nodetool-ai/sandbox-timeline`. One module. It builds a whole
timeline document in plain JavaScript and saves it through
`nodetool.timelines`, so a cut with hundreds of keyframed clips costs four API
calls instead of one `edit` op per clip. NodeTool's shipped example timelines
(Kite, Prism, Voltra, Tidewater, T minus 30) are built with it.

Use it for authored motion graphics: kinetic type, shapes, charts, placed
stills, transitions between scenes. For a few changes to a cut that already
exists, `nodetool.timelines.edit(id, ops)` is still the better tool.

## A 3-second title card

```js
import { createBuilder, cv, saveTimeline } from "@nodetool-ai/sandbox-timeline";

const W = 1920, H = 1080, FPS = 30, FRAMES = 90;
const { ms, scenes, scene, box, text, on, sceneTracks } = createBuilder({ W, H, FPS, font: "Inter" });

scene("title", 0, FRAMES - 1);
box(W, H, "#0b1020");                                   // full-frame ground
const card = box(900, 260, "#1d4ed8", { r: 24 });       // rounded card, centred
on(card, 0, 12, [cv("scale", 0.8, 1), cv("opacity", 0, 1)]);
const title = text("Hello, timeline", 96, 600, "#ffffff", { y: -10 });
on(title, 6, 14, [cv("offsetY", 40, 0), cv("opacity", 0, 1)]);

const tracks = [{ id: "t_scenes", name: "scenes", type: "video", index: 0, visible: true, locked: false }];
const layers = sceneTracks(1);
tracks.push(...layers.tracks);
const clips = [...layers.clips, ...scenes.map((s) => s.group)];

const saved = await saveTimeline(
  { name: "Title card", fps: FPS, width: W, height: H, durationMs: ms(FRAMES),
    document: { tracks, clips, markers: [] } },
  { timelines: nodetool.timelines }
);
await output("timeline", saved);   // {name, fps, width, height, durationMs, timeline_id}
```

Then look at it: `nodetool.timelines.preview(saved.timeline_id, {count: 3})`
returns composited frames, and `render(id, {preview_scale: 0.5})` a draft video.

## Study a reference and reuse scene helpers

`nodetool.timelines.examples.list()` lists shipped cuts with structural stats.
`nodetool.timelines.examples.get("kite", {clip_limit: 12})` returns its scene
catalog and a bounded scene excerpt. Select another `scene_id` or page with
`clip_offset` to read more layers. Inspect the clip hierarchy, curve windows and
effects before choosing your own scene structure.

These helpers use Kite's entrance patterns. Bind `on` from your builder, then
call them on clips within the current scene. Times are scene frames, and travel
distances are pixels.

```js
import { createBuilder, cv } from "@nodetool-ai/sandbox-timeline";
const b = createBuilder({ W: 1920, H: 1080, FPS: 30 });
const { on } = b;

function slam(clip, start, from = 1.35) {
  on(clip, start, 8, [cv("scale", from, 1), cv("blur", 26, 0, "easeOut")]);
  return on(clip, start, 3, [cv("opacity", 0, 1, "linear")]);
}
function rise(clip, start, duration = 12, distance = 24) {
  return on(clip, start, duration, [
    cv("opacity", 0, 1, "easeOut"), cv("offsetY", distance, 0)
  ]);
}
function grow(clip, start, duration, height, easing = "easeOut") {
  return on(clip, start, duration, [
    cv("scaleY", 0, 1, easing), cv("offsetY", height / 2, 0, easing)
  ]);
}

b.scene("intro", 0, 89);
b.box(1920, 1080, "#06110e", { name: "Bed" });
const plate = b.box(900, 260, "#0f1f1a", { name: "Plate" });
grow(plate, 0, 12, 260);
const title = b.text("Kite", 144, 600, "#f4fbf8", { name: "Hero" });
slam(title, 8);
const support = b.text("Save at your pace", 48, 400, "#8fb3a6", { y: 180 });
rise(support, 16);
```

Assemble `b.scenes` and `b.sceneTracks(1)` into a document and save it as in the
title-card example. For a showcase, add the planned finish and camera, then call
`nodetool.timelines.validate(id, {tier: "showcase"})`. Its warnings check scene
structure, custom keyframes, finish, camera and concurrent visual layers. Render
frames to judge how those choices look.

## Units and placement

- **Frames** everywhere: `scene(name, startFrame, endFrame)`, `on(clip, f0,
  dur, …)`. `ms(frame)` converts when a field wants milliseconds.
- **Pixels from the frame centre** for `x`, `y`. `box(w, h, …)` sizes in pixels.
- A clip spans its scene unless you pass `{from, to}` (scene frames).
- Each clip lands **above** the ones added before it in the same scene.
  Clips given the same `slot` share one track: hard cuts inside a montage.
- `sceneTracks(offset)` gives every scene its own tracks, later scenes above
  earlier ones, so an incoming scene covers the one it transitions from.
  `bankTracks(offset, ["A", "B"])` instead alternates scenes between two track
  banks. Set `bank` on the object `scene()` returns:
  `Object.assign(scene("s1", 0, 59), { bank: "A" })`.

## The builder

`createBuilder({W, H, FPS, font})` returns:

| Call | Makes |
|---|---|
| `scene(name, start, end, extra)` | a group clip; the following calls add to it |
| `box(w, h, fill, o)`, `ellipse(d, fill, o)` | shape clips; `fill` is a colour or a gradient `{type, angle, stops}`; `o.r` corner radius, `o.stroke`, `o.sw` |
| `path(points, o)` | an SVG path from `[["M", x, y], ["L", x, y], …]` in centre px |
| `text(str, size, weight, color, o)` | a text clip; `o.anchor` `"left"`/`"right"`, `o.mw` max width as a frame fraction, `o.tracking`, `o.font` |
| `image(assetId, o)`, `group(o)`, `adjust(effects, o)` | a placed still, a nested group, an adjustment layer |
| `on(clip, f0, dur, curves, opts)` | a custom animation at scene frame `f0` |
| `across(clip, curves)`, `loop(clip, period, curves)`, `fadeOut(clip, dur)` | a curve over the whole clip, a loop, a fade at the end |
| `typewriter(clip, delay, dur, opts)` | a typewriter reveal; `opts.caret` for a caret |
| `beatGrid({bpm, durationMs, snap})` | edit ops for `saveTimeline`'s `ops`: a marker per beat, then the `snap` clip ids moved onto it |

Every shape, text and image option object also takes clip fields as-is:
`effects`, `opacity`, `blendMode`, `mask`, `matte`, `crop`, `transitionIn`,
`motionBlur`, `steppedTime`, `layout`, `repeater` and the rest, plus
`transform: tf(x, y, scale, extra)` for a full transform. For a camera
depth plane, use `transform: tf(0, 0, 1, { depthPx: -400 })`.
Negative depth places the layer farther away. Camera depth is separate from
track stacking order.

`saveTimeline` preflights the document before creating a timeline row. The
host fills missing scene tracks, animation ids, clip and track effect ids,
and effect `enabled: true`. Explicit values remain unchanged.
`nodetool.packs.docs(specifier)` returns the markdown string.

Curves: `cv(property, from, to, easing)` for two keys, `kfs(property,
[[t, value, easing], …])` for more, with `t` from 0 to 1 across the
animation. Properties include `opacity`, `scale`, `scaleX`, `scaleY`,
`offsetX`, `offsetY`, `rotation`, `rotationX`, `rotationY`, `blur`,
`brightness`, `trimStart`, `trimEnd` (draw a path on) and `wipeProgress`.
`track(target, list)` keys a style track such as `text.color` or
`effect.<id>.amount`; pass those as `opts.styleTracks`.

Also exported: `tf`, `rad(degrees)`, `hash(n)` (a stable 0–1 noise),
`NOOP` (a curve that changes nothing) and `MIDI_PPQ` (960 ticks per quarter
note, for midi clips).

## Saving

`saveTimeline(bundle, {timelines, ops})` creates the timeline, writes
`bundle.document` with one `setDocument`, runs `ops` with one `edit`,
validates, and returns the bundle's metadata with `timeline_id`. It throws on
a refused write, a failed op, a clip `snap_to_beats` could not place, or a
validation error. Pass the script's own `nodetool.timelines` as `timelines`:
a module cannot see the belt the script body has.

`setDocument` fills the bookkeeping a hand-built document leaves out and
resolves two shorthands the edit ops also accept: a midi track's
`instrument: {preset: "bl1-acid"}` becomes that preset's sound, and a
typewriter's plain `durationMs` becomes its per-character reveals.

## Gotchas

- **An "in" that ends away from rest becomes an "out".** `on()` flips it so
  the end value holds for the rest of the clip. Use `across()` when a curve
  must start from its first value at the clip start.
- **Top-level document fields only.** `setDocument` keeps `tracks`, `clips`,
  `markers`, `trackFolders`, `tempo` and `camera2d`. Render settings such as
  motion blur belong on `render(id, {…})`, not in the document.
- **A new timeline each run.** `saveTimeline` always creates one; it never
  overwrites a cut the user has open.
