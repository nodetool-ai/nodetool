---
name: sandbox-timeline
description: Author a motion-graphics timeline as code — scenes, layout containers, motion primitives and transitions, saved in one call
---

# Timelines as code

Specifier: `@nodetool-ai/sandbox-timeline`. One module. It builds a whole
timeline document in plain JavaScript and saves it through
`nodetool.timelines`, so a cut with hundreds of keyframed clips costs a
handful of API calls instead of one `edit` op per clip. NodeTool's shipped
example timelines (Cadence, Kite, Prism, Voltra, Tidewater, T minus 30) are built with
it.

Use it for authored motion graphics: kinetic type, shapes, charts, placed
stills, transitions between scenes. For a few changes to a cut that already
exists, `nodetool.timelines.edit(id, ops)` is still the better tool.

**Units are seconds, everywhere, local to the scope that created them.** A
scene's own clock starts at 0. There is no absolute-time option — `v.series()`
is the only place a scene's position in the whole video is decided, and it is
the only function that ever shifts a time. Author a moment once, at the time
it happens in its own scene, and it is correct wherever that scene lands.

## A two-scene piece

```js
import { video } from "@nodetool-ai/sandbox-timeline";

const v = video({
  width: 1920, height: 1080, fps: 30,
  palette: { ink: "#06110e", ink2: "#0c2a21", text: "#f4fbf8", accent: "#34d399" },
  fonts: { display: "Space Grotesk", body: "Inter" }
});

const hello = v.scene("Hello", 2.5, (s) => {
  s.backdrop();
  const title = s.text("Hello, timeline", { size: 120, weight: 700, font: "display" });
  const sub = s.text("built from code", { size: 40, color: "#8fb3a6" });
  s.stack([title, sub], { gap: 20 });
  title.enter({ from: { scale: 1.2, opacity: 0 }, at: 0, dur: 0.3, ease: "outExpo" });
  sub.enter({ from: { offsetY: 24, opacity: 0 }, at: 0.15, dur: 0.25 });
  title.exit({ to: { opacity: 0 }, dur: 0.2 });
});

const outro = v.scene("Outro", 1.5, (s) => {
  s.backdrop({ colors: ["#0f3b2e", "#06110e"] });
  const cta = s.pill("Try it", { fillColor: "#f4fbf8", color: "#06110e" });
  cta.enter({ from: { scale: 0.6, opacity: 0 }, dur: 0.25 });
});

v.series([hello, v.transition("wipe", 0.3, { direction: "left" }), outro]);
v.adjust([{ type: "vignette", amount: 0.2 }], { name: "finish", trackId: "t_finish" });

const saved = await v.save(nodetool.timelines, { name: "Hello", showcase: true });
await output("timeline", saved);   // { timeline_id, errors, warnings }
```

Then look at it: `nodetool.timelines.preview(saved.timeline_id, {count: 3})`
returns composited frames, and `render(id, {preview_scale: 0.5})` a draft
video.

## Study a reference and reuse scene helpers

`nodetool.timelines.examples.list()` lists shipped cuts with structural stats.
`nodetool.timelines.examples.get("kite", {clip_limit: 12})` returns its scene
catalog and a bounded scene excerpt. Select another `scene_id` or page with
`clip_offset` to read more layers. Inspect the clip hierarchy, curve windows
and effects before choosing your own scene structure.

`nodetool.timelines.examples.source("kite")` returns the script that made
that excerpt: full JavaScript, imports included.

## `video({width, height, fps, palette, fonts})`

The entry point. `palette` supplies colours the craft helpers fall back to:
`ink`, `ink2`, `text`, `dim`, `accent`. `fonts` maps short keys (`display`,
`body`) to real family names; a text element's `font` option takes either a
key or a literal family string.

## Scenes and series

`v.scene(name, seconds, fn)` builds one scene at its own local clock, `fn(s)`
receiving the scene's authoring object. It returns a scene descriptor — nothing
is placed in the document yet.

`v.series([scene, transition?, scene, transition?, scene, ...])` lays scenes
end to end and assigns every clip's absolute position. A `v.transition(type,
seconds, opts)` item between two scenes overlaps them by its own duration and
sets `transitionIn` on the incoming scene's group; omitting one between a pair
makes a hard cut. `type` is one of the document's transition types (`"wipe"`,
`"whip"`, `"iris"`, `"gradientWipe"`, `"crossfade"`, `"push"`, `"slide"`,
`"zoom"`, `"zoomBlur"`, `"glitch"`, `"dipToColor"`, `"lightLeak"`); `opts`
carries that type's own fields (`direction`, `easing`, `color`, `softness`,
`map`, `seed`, …). Scenes are banked onto two alternating track sets so an
overlapping pair never shares a track — you never see or name a track.

`v.series` must run before `v.adjust`, `v.document` or `v.save`.

## Local time nests

Everything inside a scene builder is measured from that scene's own start.
`s.seq(atSec, durSec, fn)` opens a nested local clock: `fn(q)` receives a
scoped authoring object whose own `atSec`/`durationSec` for elements and
motion are relative to `atSec` *inside the enclosing scope*, not to the whole
video. Nest as deep as you like — the shift out to absolute time happens once,
in `v.series()`.

```js
// fragment
v.scene("Beat", 4, (s) => {
  s.seq(1.2, 1.0, (q) => {
    const chip = q.text("+$0.60", {});
    chip.enter({ from: { offsetY: 20, opacity: 0 }, at: 0, dur: 0.2 }); // 1.2s into the scene
  });
});
```

## Elements

Every element is a scene method returning a clip object with motion methods
attached. `at`/`dur` (seconds, defaulting to the whole enclosing scope) narrow
where in that scope the clip lives; everything else is the clip's own fields.

| Call | Makes |
|---|---|
| `s.text(str, o)` | a text clip. `o.size`, `o.weight`, `o.color`, `o.font` (a `fonts` key or a literal family), `o.tracking` (em, a fraction of size: `-0.04` tight, `0.2` wide caps), `o.italic`, `o.anchor` `"left"`/`"right"`/`"center"`, `o.mw` max width as a frame fraction, `o.path` (text-on-path: the same point commands `s.path()` takes), `o.fill` a colour or a gradient (same as `style.fill`, below), `o.style` — passthrough for any other `textStyle` field (`lineHeight`, `verticalAlign`, `stroke`, `shadow`, `background`) — an unrecognized top-level option throws, naming it and pointing at `style` |
| `s.rect(w, h, fill, o)`, `s.ellipse(d, fill, o)` | shape clips; `fill` a colour or a gradient `{type, angle\|stops, ...}`; `o.r` corner radius, `o.stroke`, `o.sw` |
| `s.path(points, o)` | an SVG path from `[["M", x, y], ["L", x, y], …]` in px from the frame centre. `H x`/`V y` take one coordinate on their own axis; `A rx ry xRotDeg largeArc sweep x y` scales the two radii as sizes and passes the angle and the two flags through unscaled |
| `s.image(assetId, o)` | a placed still |
| `s.video(assetId, o)`, `s.audio(assetId, o)` | a placed video or audio clip. `o.in` (seconds into the source), `o.volume` (dB), `o.fadeIn`/`o.fadeOut` (seconds), `o.speed` (playback rate), `o.mute`, `o.remap` (a time remap: `[{t, sourceAt, ease?}, …]`, `t` 0..1 across the clip, `sourceAt` **seconds into the source media**, not scene-local time) |
| `s.group(o)` | a nested group; children reparent onto it with `{parent: g.id}` |
| `s.adjust(effects, o)` | an adjustment layer scoped to this scene — its clip's parent is the scene's own group, so it treats that scene's surface and nothing outside it (an adjustment is group-scoped by construction). This is the way to grade one scene: a per-scene duotone, a vignette that only applies to one beat |
| `s.fill(color, o)` | a full-frame rect, same as `s.rect(W, H, color, {x:0, y:0, ...o})` |

`x`/`y` are px from the frame centre, or from the parent's own position when
the clip is reparented into a group. `rotation` (degrees) and `anchor` ({x, y}
pivot fraction, default `{0.5, 0.5}`) are friendly options for the two
`transform` fields authored most; `tx: {extra fields}` is the raw escape
hatch for the rest (`rotationX`/`rotationY`, `perspective`, `depthPx`, …), and
a full `transform: {position, scale, rotation, anchor, depthPx, ...}` override
still works when nothing else fits. Every element option also takes clip
fields as-is: `effects` (an `id`/`enabled: true` an entry leaves out is filled
in — write `{type: "glow", radius: 30, ...}`, not `{id: "...", enabled: true,
type: "glow", ...}`), `opacity`, `blendMode`, `mask` (a static crop mask —
`ClipMask`, `{kind: "rect"|..., ...}` — not the wipe mask `enter()`/`animate()`
take, below), `matte`, `crop`, `motionBlur`, `steppedTime`, `repeater`,
`inPointMs`, `outPointMs`, `speedBaked`, `fadeInShape`, `fadeOutShape`. There
is no field a clip carries that needs mutating after creation — anything
`video`/`audio`/`text` don't name a friendly option for still passes through
by its own document field name.

## Layout containers

`s.stack(children, o)` and `s.row(children, o)` build a real CSS/Yoga flex
container (`layout: {display: "flex", flexDirection: "column" | "row", gap,
alignItems, justifyContent, padding, width, height}`) and reparent `children`
onto it (`child.parentId = container.id`) — real nesting, not a sibling list.
Nest freely: a container can be a child of another container (a `row` of
`stack`s, a `stack` holding a nested `row`), and the renderer's Yoga resolver
lays out the whole tree.

The container's own placement in the frame is `o.at` (`{x, y}`, default the
frame centre) plus `o.anchor` (default `"center"`). `at` is canvas-centre-relative
— the same coordinate space every clip's own position already is: `{x: 0, y: 0}`
is frame centre, negative `x` is left of centre, negative `y` is above it.
`anchor` names the point of the container's own *computed* box that lands at
`at` — `{x: 0, y: 0.5}` or the name `"left"` put that box's left edge at
`at.x`, no measuring a sibling's width required. Example: on a 1920-wide
frame, `anchor: "left"` with `at: {x: -860, y: -212}` puts that left edge
near the frame's own left margin (-860 is 960px left of centre, i.e. near
x=100 on screen); `at: {x: 110, ...}` would instead land it just right of
centre. Named anchors: `"top-left"`, `"top"`, `"top-right"`, `"left"`,
`"center"`, `"right"`, `"bottom-left"`, `"bottom"`, `"bottom-right"`, or pass
`{x, y}` fractions directly. A container's own *time* window is `o.start`/
`o.dur` (seconds) — the one place in this API `at` doesn't mean seconds,
because the container's placement already claims it.

`o.gap` (px), `o.padding` (px, or `{top, right, bottom, left}`), `o.width`/
`o.height` (px or `"N%"`) size the container. `o.parent` nests it inside
another clip (e.g. a phone mockup) instead of the scene root. `o.wrap` turns
on `flexWrap`.

`o.align` is `"start"` (default), `"center"`, `"end"`, `"stretch"` or
`"baseline"` — the cross axis (`alignItems`): a row's shared y, a stack's
shared x. `o.justify` is `"start"`, `"center"`, `"end"`, `"between"`,
`"around"` or `"evenly"` — the main axis (`justifyContent`), unset by default
(children pack at the start with the authored gap). A `stack`/`row` call with
an unknown `align`/`justify` throws, naming the value.

A child's own flex sizing/placement is `o.flexItem` on that child's own call
(`grow`, `shrink`, `basis`, `alignSelf`, `width`, `height`, `margin`,
`position: "absolute"`, `inset`) — pass it through any element's own options,
e.g. `s.rect(..., { flexItem: { grow: 1 } })`. `s.rect`/`s.ellipse` also take
`absolute: true` as sugar for `flexItem: {position: "absolute", inset: 0}` —
taken out of flow and resized to fill its flex parent's box exactly, which is
how a pill's plate or a card's backdrop sits behind its content: create the
background *before* the foreground children (so its `_z` draws below), then
reparent it onto the container.

**A leaf's flex-measured size is its own content, never a guessed line
height** — a text child reflows to whatever width Yoga offers, and a text's
own `mw` does nothing once it sits inside a `stack`/`row`: its width comes
from the container, not from itself, so don't pass `mw` to a text child of a
container — leave it unset there. `mw` still matters on a standalone text (one
placed directly with `at`/`x`/`y`, no enclosing container); a shape/ellipse's
size is its
own `shapeStyle.width`/`height` (unset defaults to 0, not the frame, so an
undecorated plate doesn't force its siblings into a shrink negotiation); a
**plain (non-flex) group nested as a leaf measures as its children's own union
box** — give a plain group wrapping e.g. an icon + a drawn path (each a leaf
with its own small authored size) an explicit `flexItem: {width, height}`
when any of its children is a bare `path()` (no authored `shapeStyle.width`/
`height` of its own — `path()` never sets one), since that child's
un-measured intrinsic size falls back to the whole frame and the group would
measure as canvas-sized.

`s.center(child, o)` repositions `child` directly at `o.at` (default the frame
centre) — for a single element, no container needed.

## Motion primitives

All local to the clip's own start (`at: 0` is the moment the clip appears),
unless `stagger()` set a default `at` for it.

| Call | Does |
|---|---|
| `el.enter({from, at, dur, ease, mask})` | animates from `from`'s values to each property's rest pose (`opacity`/`scale`/`scaleX`/`scaleY`/`trimEnd`/`wipeProgress` rest at `1`, everything else at `0`). Always an "in" — there is no flip to solve, because the end value is always rest. |
| `el.exit({to, at, dur, ease})` | animates from each property's rest pose to `to`'s values. `at` defaults to the clip's own end minus `dur`. Always an "out". |
| `el.animate(props, {at, dur, ease, role, mask})` | a general keyframed animation. Each `props` value is `[from, to]`, `[from, to, easing]`, or a waypoint list `[[t, value], [t, value, easing], …]` with `t` from 0 to 1 across the window. |
| `el.loop(props, periodSec, {ease})` | a looping animation with a cycle of `periodSec`; `ease` defaults `"linear"` (a spin or a scroll needs constant speed). |
| `el.count({from, to, at, dur, prefix, suffix, decimals, padTo, groupSeparator, ease})` | a ticker text animator; `padTo` zero-pads the digit count (`padTo: 2` → `"09"`) |
| `el.scramble({at, dur, charset, seed, ease})` | a scramble-in text reveal (the ticker's sibling `textAnimator`) |
| `el.tween(target, keyframes, {at, dur, by, staggerMs})` | a style track, `target` like `"shape.fill"`, `"effect.<id>.amount"` or a `glyph.*` field (`glyph.color`, `glyph.blurPx`, `glyph.trackingPx`, …); `keyframes` like `animate`'s waypoint list |
| `el.draw({at, dur, ease})` | draw a path or stroke on, via `trimEnd` — `enter({from: {trimEnd: 0}, ...})` |
| `el.typewriter({at, dur, caret})` | a typewriter reveal; `set_timeline_document` resolves `dur` to one reveal per character. **Replaces** the clip's animations — a typewriter is the whole entrance. `caret`: `{color, widthPx, blinkPeriodMs}` |
| `el.preset(name, {at, dur, ease, role, ...params})` | a catalog animation baked server-side from its own curve generator, not hand-authored keyframes: `"fade"`, `"slide"`, `"pop"`, `"spin"`, `"wipe"`, `"blur"`, `"colorFade"`, `"pulse"`, `"flash"`, `"shake"`, `"bounce"`, `"squash"`, `"kenBurns"`, `"float"`, `"breathe"`, `"rotate"`, `"hueShift"`, `"orbit"`, `"followPath"`, `"typewriter"`. Every key in `o` besides `at`/`dur`/`ease`/`role`/`by`/`staggerMs` is a preset param — see `PresetParamSpec[]` per preset in `packages/timeline/src/animation/presets.ts` for names, defaults and ranges |

`enter`/`animate`/`count`/`tween` take `by` (`"word"`/`"character"`/`"line"`)
and `staggerMs` to stagger across the units of one text clip — a headline that
rises in word by word, a wordmark that types in letter by letter. **A
`glyph.*` `tween()` target needs a stagger** — the document validator refuses
one without a unit, since animating per-glyph style with no split is the
un-staggered block case `enter`/`animate` already cover. `tween()` left with
no `by` of its own inherits the stagger of the last `enter()`/`animate()` call
on the *same* clip, so a `glyph.color` tween riding the same word-by-word
reveal as its `enter()` needs no repeated `by`:

```js
// fragment
const title = s.text("Every purchase", { anchor: "left" });
title.enter({ from: { offsetY: 40, opacity: 0 }, by: "word", staggerMs: 90 });
title.tween("glyph.color", [[0, "#8fb3a6"], [1, "#f4fbf8"]]); // inherits by: "word"
```

**A `wipeProgress` animation needs `mask: {direction, softness}`** — a wipe
reveal has nowhere else to say which edge it sweeps from. Pass it on the same
`enter()`/`animate()` call that drives `wipeProgress`, not as a follow-up
mutation:

```js
// fragment
area.animate({ wipeProgress: [0, 1] }, { at: 0.4, dur: 1.3, mask: { direction: "left", softness: 0.02 } });
```

`s.stagger(items, offsetSec, fn)` offsets several **already-created**
elements' default motion `at` by `index * offsetSec`, then calls `fn(item,
index)`:

```js
// fragment
const words = ["Round-ups", "on", "every", "card"].map((w) => s.text(w, { anchor: "left" }));
s.stagger(words, 0.06, (w) => w.enter({ from: { offsetY: 40, opacity: 0 } }));
```

`ease` names: `"in"`, `"out"`, `"inOut"`, `"outExpo"`, `"inExpo"`, `"linear"`,
or a raw curve string such as `"spring(170,16,1)"` or
`"cubic-bezier(0.65,0,0.35,1)"`.

## Craft

Scene methods for the recurring structural moves. Every helper takes seconds
and px like everything else, and every option has a default, so
`s.backdrop()` alone renders a full bleed. `palette` supplies the colours a
call does not override.

| Helper | Signature | Makes |
|---|---|---|
| `s.backdrop(o?)` | `{colors: [a, b], opacity, seed}` | full-frame ink base + an animated `gradientField` wash |
| `s.glow(o?)` | `{size, alpha, color, ...}` | radial glow fading to transparent |
| `s.flash(o?)` | `{at, dur, peak, color}` | full-frame screen-blend flash, peak to 0 |
| `s.kicker(str, o?)` | `{x, y, at, dur, size, weight, color, font}` | uppercase label, left-wipe entrance |
| `s.pill(label, o?)` | `{size, weight, color, fillColor, stroke, dot, shadow, padX, padY, x, y, anchor, at, dur, font}` | a flex row (optional leading dot + label) over an absolute inset-0 background plate, optional leading dot |
| `s.streaks(o?)` | `{count, colors, rotationDeg, opacity}` | phase-shifted repeater bars racing off frame |
| `s.finish(o?)` | `{vignette, softness, grain, seed, saturation, contrast}` | scene-scoped grain + vignette adjustment |

**`s.backdrop({colors: [a, b]})` uses `a` twice** — as the solid base rect
underneath, and as the first stop of the animated `gradientField` wash on top
of it. There is no separate base colour: pass `colors: [a, b]` to mean "base
and wash both start at `a`, wash drifts toward `b`", not "a solid `a` behind a
`b`-to-something wash".

A slam, a rise, or a grow are `el.enter()`/`el.animate()` calls with the right
`from`/props — there is no separate name for them:

```js
// fragment
title.enter({ from: { scale: 1.35, blur: 26, opacity: 0 }, dur: 0.27, ease: "outExpo" }); // slam
sub.enter({ from: { offsetY: 24, opacity: 0 }, dur: 0.3 });                                     // rise
bar.animate({ scaleY: [0, 1], offsetY: [h / 2, 0] }, { dur: 0.4, ease: "out" });           // grow from its base
```

## Components

`component(name, {props, duration}, (s, props) => {...})` — a reusable piece
(a lower third, a stat card, a CTA end card) with typed props, used inside a
scene with `s.use(Comp, {...props}, {at, dur})`. `props` maps a name to
`{type: "string"|"number"|"color"|"boolean", default, description?}`;
`duration` (seconds) is the piece's own natural length, used when `use()`
gets no `dur`. `build(s, props)` is a scene builder exactly like `scene()`'s
own — it adds clips with `s.text`/`s.rect`/craft helpers/nested `use()` the
usual way; `use()` folds everything the build left at the enclosing scope
into one group, the way `pill()` folds its own dot+label+plate.

```js
// fragment
const Badge = component("Badge", {
  props: {
    label: { type: "string", default: "New" },
    tone: { type: "color", default: "#34d399" }
  },
  duration: 1
}, (s, p) => {
  s.pill(p.label, { fillColor: p.tone });
});

v.scene("Hero", 3, (s) => {
  s.use(Badge, { label: "Live now" }, { at: 0.5 });
});
```

`use()` checks `propsIn` against `Comp.props` and fills defaults, throwing
and naming the offending prop on a type mismatch or an unknown name — the
same failure a bad `caret`/`align` value gets from the type declarations
below.

### Saving a component as a composition

`Comp.saveAsComposition(nodetool.timelines, {width, height, fps, palette?,
fonts?, name?, description?})` bridges a component into the editor's
composition system (`list_compositions`/`get_composition`/
`insert_composition`): it builds `Comp` at its prop defaults into a scratch
timeline, then rebuilds it once per prop with a value distinct from that
default and diffs the two builds to find the one JSON pointer
(`packages/timeline/src/composition.ts`'s `path`) that prop reaches — the
same field a hand-written `save_composition` call would have to name. It
requires `{width, height, fps}` because a bare `component()` descriptor
carries none of its own; a call with no matching field found (unused,
reaching more than one field, or the prop only toggles whether a field
exists at all rather than setting its value) leaves that prop out of the
saved composition and lists it in `skippedParams` rather than saving a
pointer that would write the wrong thing.

**A nested `stack`/`row` inside a component round-trips too.** A composition
captures the group's whole descendant subtree, not just its direct
children, so a card holding a row of icons saves and re-inserts with the
row's own children intact and correctly nested. `saveAsComposition`'s prop
probing walks the same subtree, so a prop reaching into a nested container's
field still gets a pointer — only a prop with no single-field effect
(unused, structural, or toggling whether a field exists rather than setting
it) ends up in `skippedParams`.

## Charts

Motion graphics are often data. Every chart is built from the same shapes
and text everything else uses — bars, a line, a filled area, a ring — with
growth, staggering, and a value that counts up baked in, so it composes with
`s.stack`/`s.row`/parenting like any other element. Each returns `{group,
...pieces}`: move/parent `group` like any other clip; the pieces (`bars`,
`line`, `segments`, …) are the real shapes and labels for anything you want
to touch individually.

| Call | Makes |
|---|---|
| `s.barChart(data, o?)` | bars that grow from the baseline (staggered), each with a value label that counts up and finishes inside its own bar's growth window. `data`: `[number, ...]` or `[{value, label}, ...]`. `o`: `w`, `h`, `orientation` `"vertical"\|"horizontal"`, `gap`, `rounded`, `labels`/`axisLabels` (on/off), `stagger`, `at`, `dur`, `ease`, `highlight` (index), `color`, `palette`, `format` |
| `s.lineChart(series, o?)` | a line that draws on (`trimEnd`), points scaled into a `w`×`h` box, optional dot markers, an end value that counts from the first point to the last. `series`: `[number, ...]` or `[{x, y}, ...]` |
| `s.areaChart(series, o?)` | `lineChart`'s filled sibling — the same points close into a baseline-filled shape that grows up from the bottom, with an optional stroked line drawn on top |
| `s.donut(data, o?)` | a ring, one stroked arc per datum sweeping in from 12 o'clock, staggered; a center label counts up to the total. `o`: `d` (diameter), `thickness`, `gap` (degrees between segments), `highlight`, `palette` |
| `s.statCounter(value, o?)` | a single number that counts up — `barChart`'s value-label building block, standalone for a callout number that isn't part of a chart |

```js
// fragment
s.barChart([420, 680, 1150], { at: 0.2, stagger: 0.08, highlight: 2, format: { prefix: "$" } });
s.donut([{ value: 62, label: "Rent" }, { value: 38, label: "Everything else" }], { highlight: 0 });
```

## Top-level adjustments and audio

`v.adjust(effects, o)` runs after `v.series()`. It places a timed adjustment
layer in absolute video seconds (`o.at`, `o.dur`, default the whole video) on
its own track above every scene bank, so it always sees the full composite —
a whole-video finish (grain/vignette), or a short local burst at a cut (a
glitch spanning both sides of a hard cut). Give two calls that can overlap in
time distinct `o.trackId` values; one video track cannot hold two overlapping
clips.

`v.audio(assetId, o)` places an audio clip in absolute video seconds (`o.at`,
`o.dur`, default the whole video) on its own audio track (default `t_audio`)
— a score, a countdown, a narration bed spanning (part of) the series. Same
friendly fields as a scene's `s.audio()`: `o.volume`, `o.fadeIn`, `o.fadeOut`,
`o.mute`. `v.music(assetId, o)` is `v.audio` on its own `t_music` track, so a
score and a narration bed placed separately never collide; give either call
`o.trackId` to land somewhere else. Both also run after `v.series()`.

`v.document({camera2d, trackFolders, tempo})` sets extra top-level document
fields verbatim, applied before save.

`v.durationMs` is the video's total duration in ms, set by `v.series()` —
read it instead of computing your own total from scene durations.

## Audio-reactive motion

`el.react(audioClip, o)` drives one property from a piece of audio, with no
per-frame JS: it records the request, and `v.save()` bakes it onto the clip
right after the document is written, through `bake_audio_animation` (the
same op `nodetool.timelines.bakeAudioAnimation` exposes directly). It
composes with a hand-picked entrance the way two animations on the same
property always do (they multiply), never replacing it. `audioClip` is the
clip `s.audio()`/`v.audio()` returned — pass the element, not an asset id.

```js
// fragment
const kick = s.audio(kickAssetId, { name: "kick" });
const title = s.text("DROP", { size: 120 });
title.react(kick, { prop: "scale", mode: "beats", range: [1, 1.3], smooth: 0.05 });
```

`o.prop`: `"scale"|"opacity"|"offsetX"|"offsetY"`. `o.mode`: `"envelope"`
(follows loudness continuously, the default) or `"beats"` (one pulse per
detected onset). `o.range`: `[quiet, loud]`, defaulted per property.
`o.gain` (sensitivity), `o.smooth` (seconds, sets both `attack`/`release`),
`o.offset` (seconds, shifts the whole curve), `o.replace` (default true).

**No frequency band.** `bake_audio_animation` measures the full mix
(`envelope`) or its onsets (`beats`) — there is no band-pass filter behind
it, so `o.band` throws rather than silently reacting to the wrong thing.
Isolate that range in the source audio first if a cut needs it.

## Hand-written motion and shape morphs

`el.expr(fn, {at, dur, role})` bakes a hand-written motion function to a
keyframe-per-frame custom animation at authoring time — nothing runs at
render time. `fn(t, {p, frame, fps})` is sampled once per frame across the
window: `t` is seconds local to the window, `p` its 0..1 progress. `fn`
returns an object of animatable properties (`opacity`, `offsetX`, `scale`,
…) and/or style-track targets (any key with a `.`, e.g. `"text.color"`,
`"shape.fill"`). A property whose samples never change emits no curve;
a curve that does change is reduced to the fewest keyframes a straight-line
interpolation still reproduces within a small tolerance — a linear ramp
collapses to two keyframes, a sine keeps enough to stay recognizably a sine.

```js
// fragment
bar.expr((t) => ({ offsetY: Math.sin(t * Math.PI * 2) * 12 }), { at: 0, dur: 2 }); // a gentle bob
```

`s.noise(seed)` returns a deterministic 1D value-noise function — no
`Math.random`, so the same script produces the same motion every run.
`s.noise(seed)(x)` is a smooth 0..1 value; feed it an increasing `x` (`t`, or
`frame`) inside an `expr()` for organic jitter that never repeats:

```js
// fragment
const jitter = s.noise(7);
leaf.expr((t) => ({ rotation: (jitter(t * 4) - 0.5) * 0.2 }), { dur: 3 });
```

`el.morph(toPoints, {at, dur, ease})` morphs a path shape's outline toward
`toPoints` (the same point commands `s.path()` takes) via a `shape.d` style
track. Only straight (`M`/`L`/`Z`) paths morph — the document only
interpolates a style track when both paths share the same command sequence
and token count, so `morph()` resamples the clip's own current outline and
the target to the same vertex count by even arc length first, then rewrites
the clip's own `shapeStyle.d` to that resampled start shape so the morph's
first frame matches what was already on screen. A curved path (`C`/`A`/…)
throws rather than authoring an incompatible morph — approximate it with more
`L` segments first:

```js
// fragment
const mark = s.path([["M", -50, -50], ["L", 50, -50], ["L", 0, 50], ["Z"]], { fill: MINT }); // a triangle
mark.morph(starPoints, { at: 0.2, dur: 0.5, ease: "out" }); // -> a six-point star
```

## Midi and a beat grid

`v.midi(trackId, notes, o)` places a midi clip in absolute video seconds
(`o.at`, `o.dur`, default the whole video) on its own midi track, creating
that track the first time `trackId` is seen. `o.instrument` is a preset id
(`"bl1-acid"`, `"dr1-tr-void"`) or a full instrument object;
`set_timeline_document` resolves the shorthand. `notes` is
`[beat, pitch, lenBeats?, velocity?]` tuples — musical time, the way a score
is written, independent of where the clip itself sits:

```js
// fragment
v.midi("t_drums", [[0, 36, 0.25, 110], [1, 39, 0.25, 90]], { instrument: "dr1-tr-void" });
v.midi("t_bass", bassNotes, { instrument: "bl1-acid" });
```

`v.beats({bpm, offset, count, snap, timeSignature})` sets the document's
`tempo` (so midi and beat-driven motion play at `bpm`) and returns edit ops
for `v.save`'s `ops`: a marker per beat, then — only when `snap` names clip
ids — those clips' starts snapped onto the grid:

```js
// fragment
const saved = await v.save(nodetool.timelines, { name: "Cut", ops: v.beats({ bpm: 120, snap: ["t_drums"] }) });
```

**`v._document` is not part of this API.** It is the assembled document
`v.series()` builds and `v.save()` sends — read-only bookkeeping, not an
extension point. `v.adjust()`/`v.audio()`/`v.music()`/`v.document()` are the
only sanctioned ways to add anything after `v.series()`; mutating `v._document`
directly (pushing a clip, editing a track) skips the field-filling and
validation the rest of this API relies on, and the field can be renamed or
removed without notice.

## Saving

`v.save(timelines, {name, showcase, ops, timeline_id})` writes the document
with one `setDocument` (which snapshots the prior state first, so the write
is undoable), runs `ops` with one `edit`, validates (with `tier: "showcase"`
when `showcase: true`), and returns `{timeline_id, errors, warnings}`. It
throws on a refused write, a failed op, or a hard validation error; once the
timeline row exists, the thrown message names its id — repair that timeline
with `setDocument`/`edit` instead of calling `save()` again, which would leave
a duplicate row behind. Pass the script's own `nodetool.timelines` as
`timelines`: a module cannot see the belt the script body has.

Pass `timeline_id` to write into a timeline that already exists instead of
making another — the way to revise a cut without duplicating it.

## Revise by editing the script

`v.save()` stores the code that rebuilds the timeline on its
`document.source`, whatever else the action called. It is not the script as
written: it is the **retained program** — the scene callbacks and the
declarations they use, as source, and every value they read from anything
else (a research result, a generated asset id, a loop variable) as a literal.
A fetch, a generation or a memory write ran once, in your action; the stored
program holds only its result, so a rebake never repeats it. `v.save()`
attaches the program only when baking it gives exactly the saved document,
and answers `saved.code: {embedded, warnings}`.

The program is not attached, and `saved.code.warnings` says why, when a scene
callback:

- calls a capability (`nodetool.*`). Call it at the top level, before the
  scene, and use its result.
- uses `Math.random()` or `Date.now()`. Use `hash(n)` or `noise(seed)`, or
  compute the value at the top level.
- reads a value that cannot be written as data (a class instance, a
  function declared inside another function).

Keep helpers at the top level as `function` or `const` declarations; a
helper can read and change a `let` counter, and each scene gets the value the
counter had when it was built. When the program is not attached, or to attach
code after the fact, call `nodetool.timelines.code.set(timeline_id, code)`;
that code must build the timeline without calling a capability.

Revise it by editing that stored code, not by resending the whole body:
`code.get(id)` reads it back, `code.edit(id, edits)` applies a few small exact
string replacements (each `old` must match exactly once) and re-merges.
A rebake runs no capability: to use a new research result or a new asset,
make the call in an action and edit the value into the code. Read the
`conflicts` and
`warnings` a rebake answers, then look at frames. `api-timelines` owns the
full call contract; `code.rebake` reruns the stored code unchanged, and
`code.detach` stops tracking scenes.

**Scene names are the identity the merge keys on.** A rebake matches this
build's scenes against the timeline's current ones by `v.scene()`'s own
`name`, not by position or content — renaming a scene is a remove of the old
name plus an add of the new one, so anything hand-edited under the old name is
gone and the new one reflows in as an ordinary addition. Every clip's id is
deterministic from its scene's name plus its order of creation in the script
(`${sceneName}_${prefix}${n}`, `nid()` in this pack's own source) — never from
its screen position — so two bakes of unchanged code mint identical ids and a
change confined to one scene never shifts another's. That is what lets a
rebake survive without breaking the editor's selection.

A hand edit — in the editor, or through `edit_timeline` — inside a scene the
code tracks marks that scene "edited": the next `code.set`/`code.edit`/
`code.rebake` keeps it and reports it in `conflicts` rather than silently
overwriting it, unless `force` (`true`, or that scene's name in an array)
says otherwise.

Showcase warnings ride the successful return, not an exception — check
`saved.warnings`, or a `code.*` call's own `warnings`, and render frames to
judge what they flag.

## Types

The pack ships `sandbox/index.d.ts` (its `package.json` `types` field points
at it) — precise option types for `video`/`scene`/`series`/`transition`,
every element and craft helper, the motion primitives (`typewriter`'s
`caret` is an object, `stack`/`row`'s `align` a union), and `component`/`use`.
`nodetool jsscript validate` type-checks a script against it when the pack is
installed, so `typewriter({ caret: true })` fails validation naming `caret`
before the script ever runs.

## Gotchas

- **Every time value is seconds, local to the scope that created it.** There
  is no absolute-time option and nothing to convert by hand; `v.series()` is
  the one place a time is ever shifted.
- **`enter` and `exit` are always "in"/"out"; there is no flip to reason
  about.** `enter`'s target is always the property's rest pose, `exit`'s start
  is always rest — declare the one you mean.
- **`animate()`'s `at`/`dur` are always clip-local seconds from the clip's own
  start, whatever role it ends up with.** A curve shaped like an exit
  (trailing away from every property's rest pose) auto-picks `role: "out"`,
  the same as passing it explicitly; either way, `at`/`dur` still mean "starts
  `at` seconds in, plays for `dur`" — the pack converts that to the
  backward-from-the-clip's-end delay the document format wants, the same
  conversion `exit()` already does. Author it exactly like `enter()`; don't
  count backward by hand.
- **A `rotation` curve is degrees, the same unit as the friendly `rotation`
  option on element creation.** `enter({from: {rotation: 90}})`,
  `exit({to: {rotation: -20}})`, `animate({rotation: [0, 180]})` and
  `loop({rotation: [0, 360]}, period)` all take degrees; the pack converts to
  the document's radians internally. `rotationX`/`rotationY` curves are
  already degrees and need no conversion. `tx: {rotation: ...}` — the raw
  escape hatch — stays radians, since it writes the document field directly.
- **`stack`/`row` take `align`/`justify`** (Yoga `alignItems`/`justifyContent`;
  default `align: "start"`, `justify` unset) and place their own box in the
  frame via `at`/`anchor`, not a sibling's measured size; an unknown
  `align`/`justify` throws.
- **`setDocument` keeps the whole document, including a field this API
  didn't name.** Render settings such as motion blur are the exception —
  those belong on `render(id, {…})`, not in the document.
- **`save()` creates a new timeline only the first time.** Pass `timeline_id`
  to write into one that already exists — or, for a code-backed timeline, run
  the change through `code.edit`/`code.rebake` instead of calling `save()`
  again (below). Without either, every call still makes a new row; it never
  overwrites a cut the user has open uninvited.
