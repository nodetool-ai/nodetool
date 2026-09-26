// Voltra: a 23-second launch ad for a fictional electric motorcycle, built on
// fifteen generated stills and as many timeline features as one ad can carry.
//
// `node scripts/example-timelines/voltra.mjs` writes the shipped bundle
// packages/base-nodes/nodetool/examples/timelines/voltra.timeline.json.
// `node scripts/example-timelines/voltra.mjs --stills [name…]` regenerates the
// stills (see voltra-stills.mjs for every prompt, model and seed).
// `node scripts/render-example-timeline.mjs voltra` renders its video and poster.
//
// Frames are at 30 fps and the music is 120 BPM, so one beat is 15 frames.
// Positions are px from the frame centre. Each scene is a group clip on the
// scenes track with its own tracks below it, so a track effect (the duotone)
// never reaches another scene.
//
// Coverage. One frame per row, each checked in the encoded MP4. The music is
// in the document but not in the video: the render does not mix audio.
//
// | Feature | Clip | Frame |
// |---|---|---|
// | Slow push-in | `street` (S1) | 40 |
// | Punch-in on the beat | `motor`, `dash`, `tyre`, `rider` (S2) | 106 |
// | Parallax plates at three speeds | `bokeh`, `rain`, `road` (S3) | 250 |
// | 3D tilt, `rotationX`/`rotationY` + `perspective` | `hero-rig` (S5) | 532 |
// | `crop` reframing | `panel-*` (S2), `card-photo-*` (S4) | 180 |
// | Split screen of details | `board` (S2) | 180 |
// | `borderRadius` spec card | `card-photo-0` (S4) | 410 |
// | `rect` mask, feathered | `road` (S3) | 250 |
// | `ellipse` mask, feathered | `headlight` (S1), `hero-glow` (S5) | 60 |
// | `path` mask | `tyre` (S2) | 125 |
// | Inverted mask | `rooftop-blur` (S6) | 660 |
// | Animated wipe mask (headlight reveal) | `headlight` (S1) | 48 |
// | Alpha track matte: photo inside "R1" | `r1-fill` ← `r1-type` (S4) | 372 |
// | Luma matte from a gradient | `side` ← `side-fade` (S4) | 410 |
// | `lut` + `curves` teal-and-orange grade | `night-grade` adjustment | 60 |
// | `liftGammaGain` | `hero` (S5) | 560 |
// | `levels` | `rooftop`, `rooftop-blur` (S6) | 660 |
// | Duotone through track `colorCorrection` | tracks of `card-photo-*` (S4) | 410 |
// | `vignette`, `grain`, `sharpen` | `finish` adjustment | 560 |
// | Adjustment grading whole scenes | `night-grade` (S1–S3) | 250 |
// | Adjustment scoped inside a group | `halftone` in S4 | 410 |
// | `glow` on headlight and neon | `headlight`, `silent` (S1), `hero-glow` (S5) | 75 |
// | `directionalBlur` | `tyre` (S2), `road` (S3) | 125 |
// | `lensDistortion` | `tunnel` (S3) | 320 |
// | `dropShadow` | `panel-*` (S2), `card-photo-*` (S4) | 410 |
// | Stylize `rgbSplit` | montage stills (S2), `violent` (S3) | 106 |
// | Stylize `displacement` and `zoomBlur` | `tunnel` (S3) | 320 |
// | Stylize `halftone` | `halftone` adjustment (S4) | 410 |
// | Stylize `lightRays` | `hero` (S5) | 560 |
// | `screen` blend: rain, headlight, smoke, duotone lift | `rain-s1`, `headlight`, `smoke`, `duo-*` | 60 |
// | `multiply` blend: crush the sky under the title | `sky-crush` (S1) | 75 |
// | `overlay` blend: neon streaks on the road | `road` (S3) | 250 |
// | `glitch` transition on a group scene | S2 | 92 |
// | `slide` transition on a single image | `tyre` (S2) | 120 |
// | `push` transition on a single image | `rider` (S2) | 136 |
// | `zoom` transition on a single image | `tunnel` (S3) | 287 |
// | `wipe` transition on a group scene | S4 | 363 |
// | `crossfade` transition | `side` (S4) | 387 |
// | `push` and `zoomBlur` between card groups | `card-1`, `card-2` (S4) | 480 |
// | `dipToColor` transition | S5 | 529 |
// | `lightLeak` transition | S6 | 604 |
// | Music with a tempo, cuts on the beat (`set_markers_from_beats`, `snap_to_beats`) | `drums`, `bass`, montage stills (S2) | 105 |
// | Staggered title, by line and by word | `title`, `tagline` (S5) | 545 |
// | Typewriter with caret | `label-*` (S4) | 397 |
// | Count-up numbers | `number-*` (S4), `countdown` (S6) | 410 |
// | Caption track | `ride-caption` (S3) | 240 |
// | Text background scrim | `cta` (S6) | 680 |
// | Bundled fonts only (Bebas Neue, Inter, JetBrains Mono) | every text clip | 410 |
// | Gauge arc drawn with `trimEnd` from 0 | `arc-*` (S4) | 400 |
// | Dashed stroke | `track-*` (S4), `date-rule` (S6) | 410 |
// | Markers popping in from scale 0 | `tick-*` (S4) | 397 |
// | `camera2d` move across a wide board | `board` (S2) | 180 |
// | Motion blur from the render output settings | `render` in the bundle; `road` asks for more | 106 |
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findInstrumentPreset, MIDI_PPQ, typewriterTiming } from "@nodetool-ai/timeline";
import { applyTimelineOp } from "@nodetool-ai/timeline/ops";

import { generateStills, stillUri } from "./voltra-stills.mjs";

if (process.argv[2] === "--stills") {
  await generateStills(process.argv.slice(3));
  process.exit(0);
}

const W = 1920, H = 1080, FPS = 30, FRAMES = 690, BPM = 120, BEAT = 15;
const ms = (f) => Math.floor((f * 1000) / FPS);
const rad = (d) => (d * Math.PI) / 180;

const INK = "#05070a", TEXT = "#f4f7fb", DIM = "#9aa7b4";
const TEAL = "#2de2e6", ORANGE = "#ff8a3d", PINK = "#ff3d81";
const HEAT = { type: "linear", angle: 0, stops: [{ offset: 0, color: ORANGE }, { offset: 1, color: PINK }] };
const DISPLAY = "Bebas Neue", MONO = "JetBrains Mono", SANS = "Inter";
const EASE_IO = "cubic-bezier(0.65,0,0.35,1)", SNAP = "cubic-bezier(0.16,1,0.3,1)";

// ---------------------------------------------------------------------------
// Document plumbing (the Kite builder's, with per-scene tracks and slots)

let idc = 0;
const nid = (p) => `${p}${++idc}`;
const scenes = [];
let cur = null;

function tf(x = 0, y = 0, s = 1, extra = {}) {
  return { position: { x, y }, scale: { x: s, y: s }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, ...extra };
}

function scene(name, start, end, extra = {}) {
  const s = { name, start, end, layers: [], slots: new Map(), trackEffects: new Map() };
  s.group = {
    id: name, name, trackId: "t_scenes", startMs: ms(start), durationMs: ms(end + 1) - ms(start),
    mediaType: "group", sourceType: "imported", status: "generated", locked: false, versions: [],
    transform: tf(), ...extra
  };
  scenes.push(s);
  cur = s;
  return s;
}

const FIELDS = ["shapeStyle", "textStyle", "effects", "animations", "opacity", "blendMode", "layout", "repeater", "motionBlur",
  "temporalEcho", "mask", "matte", "crop", "borderRadius", "currentAssetId", "caption", "transitionIn", "animationLinks"];

/**
 * Adds a clip to the current scene, above everything added before it. Clips
 * naming the same `slot` share one track: a montage's hard cuts, or two groups
 * a transition runs between.
 */
function add(mediaType, o) {
  const s = cur;
  const from = o.from ?? s.start;
  const to = o.to ?? s.end;
  const clip = {
    id: o.id ?? nid(mediaType[0]), name: o.name ?? mediaType, startMs: ms(from), durationMs: ms(to + 1) - ms(from),
    mediaType, sourceType: "imported", status: "generated", locked: false, versions: [],
    parentId: o.parent ?? s.name
  };
  if (mediaType !== "adjustment") clip.transform = o.transform ?? tf(o.x ?? 0, o.y ?? 0, o.s ?? 1, o.tx ?? {});
  for (const k of FIELDS) if (o[k] !== undefined) clip[k] = o[k];
  if (o.slot !== undefined && s.slots.has(o.slot)) clip._z = s.slots.get(o.slot);
  else {
    clip._z = s.layers.length;
    if (o.slot !== undefined) s.slots.set(o.slot, clip._z);
  }
  if (o.trackEffects) s.trackEffects.set(clip._z, o.trackEffects);
  clip._from = from;
  s.layers.push(clip);
  return clip;
}

const group = (o) => add("group", o);
const image = (still, o = {}) => add("image", { name: still, ...o, currentAssetId: stillUri(still) });
const adjust = (effects, o = {}) => add("adjustment", { name: "adjust", ...o, effects });

/** A shape drawn centred in the frame raster, then placed by its transform. */
function box(w, h, fill, o = {}) {
  const shape = { kind: o.kind ?? "rect", x: 0.5 - w / 2 / W, y: 0.5 - h / 2 / H, width: w / W, height: h / H, cornerRadius: (o.r ?? 0) / W };
  if (typeof fill === "string") shape.fill = fill; else if (fill) shape.fillStyle = fill;
  if (o.stroke) { shape.stroke = o.stroke; shape.strokeWidthPx = o.sw ?? 1; }
  Object.assign(shape, o.shape ?? {});
  return add("shape", { ...o, shapeStyle: shape });
}
const ellipse = (d, fill, o = {}) => box(d, d, fill, { ...o, kind: "ellipse" });

/** An SVG path given in px from the frame centre. */
function path(points, o = {}) {
  const X = (v) => ((W / 2 + v) / W).toFixed(5), Y = (v) => ((H / 2 + v) / H).toFixed(5);
  const d = points.map(([cmd, ...xy]) => cmd + xy.map((v, i) => (i % 2 ? Y(v) : X(v))).join(" ")).join(" ");
  const shape = { kind: "path", d, lineCap: "round", lineJoin: "round" };
  if (o.fill) { if (typeof o.fill === "string") shape.fill = o.fill; else shape.fillStyle = o.fill; }
  if (o.stroke) { shape.stroke = o.stroke; shape.strokeWidthPx = o.sw ?? 4; }
  return add("shape", { ...o, shapeStyle: shape });
}

/** A text clip. `anchor` "left" puts the block's left edge at x, "right" its right edge. */
function text(str, size, weight, color, o = {}) {
  const anchor = o.anchor ?? "center";
  const mw = o.mw ?? 0.9;
  const x0 = o.x ?? 0;
  const x = anchor === "left" ? x0 + (mw * W) / 2 : anchor === "right" ? x0 - (mw * W) / 2 : x0;
  const style = { text: str, fontFamily: o.font ?? SANS, fontSizePx: size, fontWeight: weight, color, align: anchor, maxWidthFrac: mw, ...(o.style ?? {}) };
  if (o.tracking) style.letterSpacingPx = o.tracking * size;
  if (o.fill) style.fill = o.fill;
  return add("text", { ...o, x, textStyle: style });
}

const cv = (property, a, b, easing = "easeOutExpo") => ({ property, keyframes: [{ t: 0, value: a }, { t: 1, value: b, easing }] });
const kfs = (property, list) => ({ property, keyframes: list.map(([t, value, easing]) => (easing ? { t, value, easing } : { t, value })) });
const NOOP = cv("opacity", 1, 1, "linear");
const REST = { opacity: 1, scale: 1, scaleX: 1, scaleY: 1, trimEnd: 1, wipeProgress: 1 };
const track = (target, list) => ({ target, keyframes: list.map(([t, value, easing]) => (easing ? { t, value, easing } : { t, value })) });

/**
 * One custom animation on `clip`, starting at scene frame `f0` and running
 * `dur` frames. An "in" that ends mid-clip away from its rest pose becomes an
 * "out" so its end value holds for the rest of the clip.
 */
function on(clip, f0, dur, curves, opts = {}) {
  const local = cur.start + f0 - clip._from;
  const delayMs = ms(clip._from + local) - ms(clip._from);
  const durationMs = Math.max(1, ms(clip._from + local + dur) - ms(clip._from + local));
  const a = { id: nid("a"), role: "in", preset: "custom", delayMs, durationMs, custom: { curves }, ...opts };
  const endMs = a.delayMs + a.durationMs;
  const leavesRest = curves.some((c) => c.keyframes.at(-1).value !== (REST[c.property] ?? 0)) || (a.styleTracks && !a.textAnimator);
  if (a.role === "in" && endMs < clip.durationMs && leavesRest) {
    a.role = "out";
    a.delayMs = clip.durationMs - endMs;
  }
  clip.animations = [...(clip.animations ?? []), a];
  return clip;
}

/** Curves stretched over the whole clip, so the end value holds without an "out". */
function across(clip, curves, opts = {}) {
  clip.animations = [...(clip.animations ?? []), { id: nid("a"), role: "in", preset: "custom", delayMs: 0, durationMs: clip.durationMs, custom: { curves }, ...opts }];
  return clip;
}

/** A looping custom animation with a cycle of `dur` frames. */
function loop(clip, dur, curves) {
  clip.animations = [...(clip.animations ?? []), { id: nid("a"), role: "loop", preset: "custom", delayMs: 0, durationMs: ms(dur), custom: { curves } }];
  return clip;
}

/** Fade the whole clip out over its last `dur` frames. */
function fadeOut(clip, dur) {
  clip.animations = [...(clip.animations ?? []), { id: nid("a"), role: "out", preset: "custom", delayMs: 0, durationMs: ms(dur), custom: { curves: [cv("opacity", 1, 0, "easeIn")] } }];
  return clip;
}

const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/**
 * Rain that falls: the plate jumps to a new offset every two frames on held
 * keys, the way a flicker of streaks reads in live action. A scrolling tile
 * showed its seam, because the generated plate is denser at the top.
 */
function rainShimmer(clip, seed, reach = 140) {
  const frames = Math.round((clip.durationMs / 1000) * FPS);
  const steps = Math.max(2, Math.floor(frames / 2));
  const at = (axis) => kfs(axis, Array.from({ length: steps + 1 }, (_, k) => [k / steps, Math.round((hash(seed * 97 + k * 3 + (axis === "offsetX" ? 1 : 2)) - 0.5) * 2 * reach), k ? "hold" : undefined]));
  return across(clip, [at("offsetX"), at("offsetY")]);
}

/** Text that slams in: large to rest size, out of a blur. */
function slam(clip, f0, from = 1.4) {
  on(clip, f0, 8, [cv("scale", from, 1, SNAP), cv("blur", 24, 0, "easeOut")]);
  return on(clip, f0, 3, [cv("opacity", 0, 1, "linear")]);
}

// ---------------------------------------------------------------------------
// The grade

/**
 * A 9³ teal-and-orange `.cube`: shadows lean teal, highlights lean orange,
 * a gentle S-curve on luma. Generated so the table is readable in review.
 */
function tealOrangeCube(size = 9) {
  const lines = ["TITLE \"Voltra night\"", `LUT_3D_SIZE ${size}`];
  const clamp = (v) => Math.min(1, Math.max(0, v));
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const [R, G, B] = [r, g, b].map((v) => v / (size - 1));
        const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        const lo = (1 - l) ** 2, hi = l ** 2;
        const s = (v) => v + 0.12 * (v - 0.5) * (1 - Math.abs(2 * v - 1));
        const out = [s(R + hi * 0.07 - lo * 0.05), s(G + lo * 0.015), s(B + lo * 0.07 - hi * 0.06)].map((v) => clamp(v).toFixed(4));
        lines.push(out.join(" "));
      }
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// S1 Cold open (0–95): the dark street, then a headlight flickers on.

function buildS1() {
  scene("S1", 0, 95);
  const street = image("street", { name: "street", s: 1.06 });
  across(street, [kfs("scale", [[0, 1], [1, 1.1, "linear"]]), kfs("brightness", [[0, -0.55], [0.35, 0, "easeOut"], [1, 0, "linear"]])]);
  // The sky over the street is the brightest area the title sits on. A
  // multiplied gradient crushes it to black without greying the neon.
  box(W, H, { type: "linear", angle: 90, stops: [{ offset: 0, color: "#1a2530" }, { offset: 0.55, color: "#ffffff" }, { offset: 1, color: "#ffffff" }] }, { name: "sky-crush", blendMode: "multiply" });

  // The headlight bar, screened over the street so only its light lands. The
  // feathered ellipse keeps the dark bodywork out; the wipe reveals the bar
  // left to right while the opacity flickers like a cold LED warming up.
  const light = image("headlight", {
    name: "headlight", from: 42, blendMode: "screen", y: -40, s: 0.9,
    mask: { kind: "ellipse", x: 0.02, y: 0.22, width: 0.96, height: 0.42, featherPx: 90 },
    effects: [{ id: "hg", type: "glow", enabled: true, radius: 48, intensity: 1.3, color: "#bff7ff" }]
  });
  on(light, 45, 10, [cv("wipeProgress", 0, 1, "easeOut")]);
  light.animations.at(-1).custom.mask = { direction: "left", softness: 0.12 };
  const flicker = [[0, 0], [0.12, 1, "hold"], [0.2, 0.15, "hold"], [0.3, 1, "hold"], [0.42, 0.35, "hold"], [0.5, 1, "hold"], [1, 1, "linear"]];
  on(light, 45, 20, [kfs("opacity", flicker)]);

  rainShimmer(image("plate-rain", { name: "rain-s1", blendMode: "screen", opacity: 0.4, s: 1.3 }), 1);

  const silent = text("SILENT.", 240, 400, TEAL, {
    name: "silent", font: DISPLAY, from: 62, y: 300, tracking: 0.08,
    effects: [{ id: "ng", type: "glow", enabled: true, radius: 30, intensity: 1.1, color: TEAL }]
  });
  on(silent, 62, 10, [cv("offsetY", 30, 0, SNAP), cv("opacity", 0, 1, "easeOut")], { stagger: { unit: "character", offsetMs: 35 } });
}

// ---------------------------------------------------------------------------
// S2 Details (90–210): four macros cut on the beat, then a board of all five
// that the camera pans across.

const MONTAGE = [
  { still: "motor", word: "TORQUE.", label: "02 / AXIAL-FLUX MOTOR" },
  { still: "dash", word: "DATA.", label: "03 / 5\" TFT DASH" },
  { still: "tyre", word: "GRIP.", label: "04 / 17\" STREET SLICKS" },
  { still: "rider", word: "YOU.", label: "05 / THE RIDER" }
];
const montageIds = [];

function buildS2() {
  scene("S2", 90, 209, { transitionIn: { type: "glitch", durationMs: 200, amount: 0.8, easing: "linear" } });
  box(W, H, INK, { name: "ink" });

  // One beat per macro, laid on the tempo grid; `snap_to_beats` below checks
  // every cut against the same grid.
  MONTAGE.forEach(({ still, word, label }, i) => {
    const from = 90 + i * BEAT;
    // Dash and tyre run three and four frames past their beat, under the
    // slide and the push that bring the next still in.
    const to = i === MONTAGE.length - 1 ? 149 : from + BEAT - 1 + ([0, 3, 4, 0][i]);
    const clip = image(still, {
      name: still, id: `m-${still}`, slot: "montage", from, to,
      effects: [
        { id: "rs", type: "stylize", enabled: true, mode: "rgbSplit", amount: 0, angle: 0 },
        ...(still === "tyre" ? [{ id: "db", type: "directionalBlur", enabled: true, radius: 14, angle: 0 }] : [])
      ],
      ...(still === "tyre" && { mask: { kind: "path", d: "M0.10 0 L1 0 L0.90 1 L0 1 Z" } }),
      ...(still === "tyre" && { transitionIn: { type: "slide", durationMs: 100, direction: "right", easing: SNAP } }),
      ...(still === "rider" && { transitionIn: { type: "push", durationMs: 130, direction: "up", easing: SNAP } })
    });
    montageIds.push(clip.id);
    // A punch-in on the beat, then a slow settle; the RGB split rides the hit.
    on(clip, from - 90, 5, [cv("scale", 1.28, 1.08, SNAP)]);
    on(clip, from - 90 + 5, to - from - 5, [cv("scale", 1, 1.035, "linear")]);
    on(clip, from - 90, 6, [NOOP], { styleTracks: [track("effect.rs.amount", [[0, 18], [1, 0, "easeOut"]])] });
    const w = text(word, 200, 400, TEXT, { name: `word-${still}`, font: DISPLAY, from, to: Math.min(to, from + BEAT - 1), anchor: "left", mw: 0.5, x: -860, y: 330, tracking: 0.02 });
    slam(w, from - 90, 1.25);
    text(label, 30, 500, TEAL, { name: `label-${still}`, font: MONO, from, to: Math.min(to, from + BEAT - 1), anchor: "left", mw: 0.4, x: -856, y: 210, style: { letterSpacingPx: 2 } });
  });

  // The board: five portrait crops side by side, far wider than the frame.
  // The camera pans across it; the bokeh sits far back, so it drifts slower.
  const bokeh = image("plate-bokeh", { name: "board-bokeh", from: 150, opacity: 0.25, s: 2.7, tx: { depthPx: -1400 }, effects: [{ id: "bb", type: "blur", enabled: true, radius: 14 }] });
  on(bokeh, 60, 8, [cv("opacity", 0, 1, "linear")]);
  const board = group({ name: "board", from: 150 });
  ["headlight", "motor", "dash", "tyre", "rider"].forEach((still, i) => {
    const x = (i - 2) * 520;
    const panel = image(still, {
      name: `panel-${still}`, parent: board.id, from: 150, x, y: 10, s: 0.6,
      crop: { left: still === "rider" ? 0.22 : 0.3, right: still === "rider" ? 0.38 : 0.3, top: 0, bottom: 0 },
      borderRadius: 40,
      effects: [{ id: nid("ps"), type: "dropShadow", enabled: true, offsetX: 0, offsetY: 30, blur: 60, color: "rgba(0,0,0,0.7)" }]
    });
    on(panel, 60 + i * 3, 12, [cv("offsetY", 60, 0, SNAP), cv("opacity", 0, 1, "easeOut")]);
    const tag = text(`0${i + 1}`, 30, 500, TEAL, { name: `panel-tag-${still}`, parent: board.id, font: MONO, from: 150, x: x - 210, y: -290, anchor: "left", mw: 0.05 });
    on(tag, 64 + i * 3, 10, [cv("opacity", 0, 1, "easeOut")]);
  });
  const strap = text("EVERY PART MADE FOR THE NIGHT", 34, 600, TEXT, { name: "board-strap", parent: board.id, from: 150, y: 390, tracking: 0.3 });
  on(strap, 76, 14, [cv("opacity", 0, 1, "easeOut"), cv("offsetY", 20, 0, SNAP)]);
}

// ---------------------------------------------------------------------------
// S3 The ride (210–364): parallax plates over the ride shot, then the tunnel.

function buildS3() {
  scene("S3", 210, 364);
  const ride = image("ride", { name: "ride", slot: "ride", to: 290 });
  across(ride, [kfs("scale", [[0, 1.04], [1, 1.12, "linear"]])]);
  // Tunnel: the camera pushes in on a bulging lens, the air shimmering.
  const tunnel = image("tunnel", {
    name: "tunnel", slot: "ride", from: 283,
    transitionIn: { type: "zoom", durationMs: 200, easing: "easeIn" },
    effects: [
      { id: "ld", type: "lensDistortion", enabled: true, amount: 0.28 },
      { id: "dp", type: "stylize", enabled: true, mode: "displacement", amount: 0.3, scale: 6, animate: true, seed: 5 },
      { id: "zb", type: "stylize", enabled: true, mode: "zoomBlur", amount: 1.5 }
    ]
  });
  across(tunnel, [kfs("scale", [[0, 1], [1, 1.45, "easeIn"]])]);

  // Three plates, three speeds: bokeh far and slow, rain mid, road near and fast.
  const bokeh = image("plate-bokeh", { name: "bokeh", blendMode: "screen", opacity: 0.28, s: 1.2, to: 285, repeater: { count: 2, positionStep: { x: W * 1.2, y: 0 }, timeStepMs: 0 } });
  loop(bokeh, 120, [kfs("offsetX", [[0, 0], [1, -W * 1.2, "linear"]])]);
  rainShimmer(image("plate-rain", { name: "rain", blendMode: "screen", opacity: 0.5, s: 1.5, tx: { rotation: rad(-10) } }), 2, 180);
  const road = image("plate-road", {
    name: "road", blendMode: "overlay", opacity: 0.6, to: 285,
    repeater: { count: 2, positionStep: { x: W, y: 0 }, timeStepMs: 0 },
    mask: { kind: "rect", x: 0, y: 0.8, width: 1, height: 0.2, featherPx: 60 },
    effects: [{ id: "rdb", type: "directionalBlur", enabled: true, radius: 40, angle: 0 }],
    motionBlur: { samplesPerFrame: 8, shutterAngle: 300 }
  });
  loop(road, 12, [kfs("offsetX", [[0, 0], [1, -W, "linear"]])]);

  // What the rider hears: nothing. A caption track, word-timed to the beat.
  const words = [["No", 225], ["noise.", 232], ["No", 247], ["fumes.", 254], ["Just", 270], ["pull.", 277]];
  add("video", {
    name: "ride-caption", from: 225, to: 296,
    caption: {
      words: words.map(([word, f], i) => ({ word, startMs: ms(f) - ms(225), endMs: ms(i < words.length - 1 ? words[i + 1][1] : 296) - ms(225) })),
      style: { fontFamily: SANS, fontSizeFrac: 0.05, color: "rgba(244,247,251,0.55)", activeColor: TEXT, bottomMarginFrac: 0.1, background: { color: "rgba(5,7,10,0.55)", paddingPx: 18, radiusPx: 12 } }
    }
  });

  const violent = text("VIOLENT.", 280, 400, TEXT, {
    name: "violent", font: DISPLAY, from: 330, tracking: 0.06, fill: HEAT,
    effects: [{ id: "vs", type: "stylize", enabled: true, mode: "rgbSplit", amount: 0, angle: 0 }]
  });
  slam(violent, 120, 1.6);
  on(violent, 120, 10, [NOOP], { styleTracks: [track("effect.vs.amount", [[0, 24], [1, 0, "easeOut"]])] });
}

// ---------------------------------------------------------------------------
// S4 The specs (360–534): "R1" filled with the motor, then three spec cards.

const SPECS = [
  { still: "tyre", crop: { left: 0.3, right: 0.34, top: 0, bottom: 0 }, label: "0–100 KM/H", from: 0, to: 2.9, decimals: 1, unit: "SECONDS", fraction: 0.9 },
  { still: "motor", crop: { left: 0.32, right: 0.32, top: 0, bottom: 0 }, label: "RANGE", from: 0, to: 480, decimals: 0, unit: "KM · CITY", fraction: 0.8 },
  { still: "ride", crop: { left: 0.42, right: 0.22, top: 0, bottom: 0 }, label: "TOP SPEED", from: 0, to: 240, decimals: 0, unit: "KM/H", fraction: 0.96 }
];
const DUOTONE = [{ id: "duo", type: "colorCorrection", enabled: true, brightness: 0.08, contrast: 1.6, saturation: 0, hue: 0, temperature: 1, tint: 0.15, shadows: -0.25, highlights: 0.15 }];

function specCard(spec, i, from, to) {
  const card = group({ name: `card-${i}`, slot: "cards", from, to, ...(i === 1 && { transitionIn: { type: "push", durationMs: 160, direction: "up", easing: SNAP } }),
    ...(i === 2 && { transitionIn: { type: "zoomBlur", durationMs: 160, blur: 1, easing: "easeIn" } }) });
  const f0 = from - 360;
  // Left: the detail, cropped to a portrait card, graded orange-on-black by
  // its track, then lifted to teal in the shadows by a screened plate.
  const photo = image(spec.still, {
    name: `card-photo-${i}`, parent: card.id, from, to, x: -470, y: 10, s: 0.6, crop: spec.crop, borderRadius: 48,
    trackEffects: DUOTONE,
    effects: [{ id: nid("cs"), type: "dropShadow", enabled: true, offsetX: 0, offsetY: 36, blur: 70, color: "rgba(0,0,0,0.75)" }]
  });
  const cw = Math.round(W * (1 - spec.crop.left - spec.crop.right) * (H / H) * 0.6 * (1080 / 1080));
  box(cw, 648, "#032a33", { name: `duo-${i}`, parent: card.id, from, to, x: -470, y: 10, r: 29, blendMode: "screen" });
  text(`0${i + 1}`, 30, 500, TEAL, { name: `card-index-${i}`, parent: card.id, font: MONO, from, to, anchor: "left", mw: 0.05, x: -470 - cw / 2 + 28, y: -290 });
  on(photo, f0, 12, [cv("scale", 0.9, 1, SNAP)]);

  // Right: a gauge. The dashed track is 270°; the arc draws on to the spec's
  // fraction of it from exactly 0, and the ticks pop in from scale 0.
  const gx = 430, gy = 30, R = 250, start = 135;
  box(2 * R, 2 * R, null, { name: `track-${i}`, parent: card.id, from, to, kind: "ellipse", x: gx, y: gy, stroke: "rgba(154,167,180,0.45)", sw: 6, tx: { rotation: rad(start) }, shape: { trimEnd: 0.75, dash: [6 / W, 14 / W] } });
  const arc = box(2 * R, 2 * R, null, {
    name: `arc-${i}`, parent: card.id, from, to, kind: "ellipse", x: gx, y: gy, stroke: ORANGE, sw: 14, tx: { rotation: rad(start) }, shape: { lineCap: "round" },
    effects: [{ id: nid("ag"), type: "glow", enabled: true, radius: 18, intensity: 0.9, color: ORANGE }]
  });
  const span = to - from, drawTo = 0.75 * spec.fraction;
  // Stretched over the whole clip: an "in" that ends away from rest would
  // hold the full ring until its window opened.
  across(arc, [kfs("trimEnd", [[0, 0], [4 / span, 0, "linear"], [26 / span, drawTo, EASE_IO], [1, drawTo, "linear"]])]);
  for (let k = 0; k <= 6; k++) {
    const a = rad(start + (270 * k) / 6);
    const tick = ellipse(12, k / 6 <= spec.fraction ? TEXT : DIM, { name: `tick-${i}-${k}`, parent: card.id, from, to, x: gx + (R + 34) * Math.cos(a), y: gy + (R + 34) * Math.sin(a) });
    on(tick, f0 + 4 + k * 2, 10, [cv("scale", 0, 1, "spring(260,14,1)")]);
  }

  const label = text(spec.label, 40, 500, TEAL, { name: `label-${i}`, parent: card.id, font: MONO, from, to, x: gx, y: -300, mw: 0.3, style: { letterSpacingPx: 3 } });
  // Stored the way `animate_clip` stores it: one-millisecond reveals, one per
  // character. A typewriter written with a plain duration draws nothing until
  // its window ends.
  const typed = typewriterTiming(spec.label, label.durationMs - ms(2), ms(12));
  label.animations = [{ id: nid("a"), role: "in", preset: "typewriter", delayMs: ms(2), ...typed, caret: { color: TEAL, widthPx: 4, blinkPeriodMs: 500 } }];
  const fmt = spec.decimals ? spec.to.toFixed(spec.decimals) : String(spec.to);
  const number = text(fmt, 230, 400, TEXT, { name: `number-${i}`, parent: card.id, font: DISPLAY, from, to, x: gx, y: gy - 10, mw: 0.3 });
  on(number, f0 + 4, 22, [NOOP], { textAnimator: { kind: "ticker", from: spec.from, to: spec.to, decimals: spec.decimals }, easing: EASE_IO });
  const unit = text(spec.unit, 34, 600, DIM, { name: `unit-${i}`, parent: card.id, from, to, x: gx, y: gy + 120, mw: 0.3, tracking: 0.25 });
  on(unit, f0 + 10, 10, [cv("opacity", 0, 1, "easeOut")]);
}

function buildS4() {
  scene("S4", 360, 534, { transitionIn: { type: "wipe", durationMs: 200, direction: "left", softness: 0, easing: SNAP } });
  box(W, H, INK, { name: "ink" });

  // "R1": the huge type is an alpha matte, and the motor's copper fills it.
  const r1 = text("R1", 1000, 400, "#ffffff", { name: "r1-type", font: DISPLAY, to: 390, y: 40, tracking: -0.02 });
  on(r1, 0, 10, [cv("scale", 1.25, 1, SNAP)]);
  const fill = image("motor", { name: "r1-fill", slot: "backdrop", to: 390, s: 1.3, matte: { sourceClipId: r1.id, mode: "alpha" } });
  across(fill, [kfs("offsetX", [[0, -80], [1, 80, "linear"]])]);
  const kicker = text("VOLTRA R1  /  SPEC SHEET", 30, 500, TEAL, { name: "r1-kicker", font: MONO, to: 390, y: -430, style: { letterSpacingPx: 4 } });
  on(kicker, 4, 10, [cv("opacity", 0, 1, "easeOut")]);

  // Behind the cards: the side profile, faded out toward the type by a luma
  // matte cut from a gradient, and screened through a halftone adjustment
  // that treats this scene's surface only.
  const fade = box(W, H, { type: "linear", angle: 0, stops: [{ offset: 0, color: "#ffffff" }, { offset: 0.45, color: "#8a8a8a" }, { offset: 0.8, color: "#000000" }] }, { name: "side-fade", from: 385 });
  const side = image("side", { name: "side", slot: "backdrop", from: 385, transitionIn: { type: "crossfade", durationMs: 160, easing: "easeInOut" }, opacity: 0.55, x: -200, s: 1.05, matte: { sourceClipId: fade.id, mode: "luma" } });
  across(side, [kfs("offsetX", [[0, 60], [1, -60, "linear"]])]);
  adjust([{ id: "ht", type: "stylize", enabled: true, mode: "halftone", amount: 1, scale: 7 }], { name: "halftone", from: 385, opacity: 0.22 });

  specCard(SPECS[0], 0, 390, 438);
  specCard(SPECS[1], 1, 433, 483);
  specCard(SPECS[2], 2, 478, 534);
}

// ---------------------------------------------------------------------------
// S5 The reveal (525–605): the hero tilts flat under light rays, then the lock-up.

function buildS5() {
  scene("S5", 525, 605, { transitionIn: { type: "dipToColor", durationMs: 300, color: "#dff9ff", easing: "easeInOut" } });
  box(W, H, INK, { name: "ink" });
  const rig = group({ name: "hero-rig", tx: { perspective: 1800 } });
  on(rig, 0, 32, [cv("rotationY", -26, 0, SNAP), cv("rotationX", 9, 0, SNAP), cv("scale", 0.86, 1, SNAP)]);
  on(rig, 32, 48, [cv("scale", 1, 1.035, "linear")]);
  const hero = image("hero", {
    name: "hero", parent: rig.id,
    effects: [
      { id: "lgg", type: "liftGammaGain", enabled: true, lift: [0, 0.015, 0.035], gamma: [1, 1, 1.03], gain: [1.06, 1, 0.94] },
      { id: "lr", type: "stylize", enabled: true, mode: "lightRays", amount: 0, scale: 1.6, angle: 0, color: "#9ff6ff" }
    ]
  });
  across(hero, [NOOP], { styleTracks: [track("effect.lr.amount", [[0, 0], [0.3, 0.4, "easeOut"], [1, 0.28, "linear"]]), track("effect.lr.angle", [[0, 0], [1, 22, "linear"]])] });
  // The headlight bar, isolated by a feathered ellipse and bloomed.
  image("hero", {
    name: "hero-glow", parent: rig.id, blendMode: "screen",
    mask: { kind: "ellipse", x: 0.625, y: 0.2, width: 0.16, height: 0.17, featherPx: 40 },
    effects: [{ id: "hgl", type: "glow", enabled: true, radius: 60, intensity: 1.6, color: "#c8fbff" }]
  });
  const smoke = image("plate-smoke", { name: "smoke", blendMode: "screen", opacity: 0.22, y: 260, s: 1.2 });
  across(smoke, [kfs("offsetX", [[0, -120], [1, 120, "linear"]])]);

  const title = text("SILENT.\nVIOLENT.", 150, 400, TEXT, { name: "title", font: DISPLAY, from: 541, anchor: "left", mw: 0.4, x: -870, y: 200, style: { lineHeight: 0.92 }, tracking: 0.03 });
  on(title, 16, 12, [cv("offsetY", 50, 0, SNAP), cv("opacity", 0, 1, "easeOut")], { stagger: { unit: "line", offsetMs: 160 } });
  const tagline = text("THE ELECTRIC STREET MACHINE", 32, 600, TEAL, { name: "tagline", from: 552, anchor: "left", mw: 0.4, x: -866, y: 356, tracking: 0.28, style: { shadow: { color: "rgba(0,0,0,0.85)", blurPx: 14, offsetX: 0, offsetY: 2 } } });
  on(tagline, 27, 10, [cv("offsetY", 16, 0, SNAP), cv("opacity", 0, 1, "easeOut")], { stagger: { unit: "word", offsetMs: 70 } });

  // Lock-up, top left: a bolt drawn on, the wordmark, and "R1" in a badge.
  const bolt = path([["M", -836, -436], ["L", -862, -384], ["L", -838, -384], ["L", -856, -336], ["L", -812, -398], ["L", -836, -398], ["L", -818, -436], ["Z"]], {
    name: "bolt", stroke: TEAL, sw: 5, fill: "rgba(45,226,230,0)",
    effects: [{ id: "bg", type: "glow", enabled: true, radius: 16, intensity: 1, color: TEAL }]
  });
  on(bolt, 10, 14, [cv("trimEnd", 0, 1, EASE_IO)]);
  const wordmark = text("VOLTRA", 110, 400, TEXT, { name: "wordmark", font: DISPLAY, anchor: "left", mw: 0.2, x: -790, y: -386, tracking: 0.12 });
  on(wordmark, 14, 12, [cv("opacity", 0, 1, "easeOut"), cv("offsetX", -20, 0, SNAP)]);
  const badge = group({ name: "r1-badge", x: -452, y: -388 });
  box(96, 70, null, { name: "badge-frame", parent: badge.id, stroke: TEAL, sw: 3, r: 10 });
  text("R1", 56, 400, TEAL, { name: "badge-r1", parent: badge.id, font: DISPLAY, mw: 0.06, y: 2 });
  on(badge, 20, 12, [cv("scale", 0, 1, "spring(220,15,1)")]);
}

// ---------------------------------------------------------------------------
// S6 The drop (598–689): a countdown to the date, then "Reserve now".

function buildS6() {
  const s = scene("S6", 598, 689, { transitionIn: { type: "lightLeak", durationMs: 330, color: ORANGE, scale: 1.2, seed: 4, easing: "easeInOut" } });
  fadeOut(s.group, 10);
  const roof = image("rooftop", { name: "rooftop", effects: [{ id: "lv", type: "levels", enabled: true, inBlack: 0.04, inWhite: 1, gamma: 0.85, outBlack: 0, outWhite: 0.72 }] });
  across(roof, [kfs("scale", [[0, 1.12], [1, 1.02, "easeOut"]])]);
  // Tilt-shift: a blurred copy everywhere except the band the type sits in.
  image("rooftop", {
    name: "rooftop-blur",
    effects: [{ id: "rb", type: "blur", enabled: true, radius: 22 }, { id: "lv2", type: "levels", enabled: true, inBlack: 0.04, inWhite: 1, gamma: 0.85, outBlack: 0, outWhite: 0.6 }],
    mask: { kind: "rect", x: 0, y: 0.28, width: 1, height: 0.44, featherPx: 90, invert: true }
  });
  across(s.layers.at(-1), [kfs("scale", [[0, 1.12], [1, 1.02, "easeOut"]])]);
  box(W, H, "rgba(5,7,10,0.35)", { name: "dim" });

  const drops = text("DROPS IN", 34, 500, TEAL, { name: "drops-in", font: MONO, to: 638, y: -210, style: { letterSpacingPx: 8 } });
  on(drops, 4, 8, [cv("opacity", 0, 1, "easeOut")]);
  const countdown = text("00 DAYS", 300, 400, TEXT, { name: "countdown", font: DISPLAY, to: 638, y: -30, tracking: 0.02 });
  on(countdown, 4, 28, [NOOP], { textAnimator: { kind: "ticker", from: 49, to: 0, padTo: 2, suffix: " DAYS" }, easing: "easeInQuint" });
  slam(countdown, 4, 1.15);

  const date = text("11.14", 380, 400, TEXT, { name: "date", font: DISPLAY, from: 639, y: -60, tracking: 0.03, fill: HEAT });
  slam(date, 41, 1.5);
  const rule = box(620, 4, null, { name: "date-rule", from: 639, kind: "line", y: 120, stroke: DIM, sw: 3, shape: { x: 0.5 - 310 / W, y: 0.5, x2: 0.5 + 310 / W, y2: 0.5, dash: [10 / W, 10 / W] } });
  on(rule, 43, 12, [cv("trimEnd", 0, 1, EASE_IO)]);
  const when = text("SATURDAY  ·  LIMITED FIRST RUN", 30, 500, DIM, { name: "when", font: MONO, from: 641, y: 160, style: { letterSpacingPx: 4 } });
  on(when, 45, 10, [cv("opacity", 0, 1, "easeOut")]);
  const cta = text("RESERVE NOW", 54, 700, INK, { name: "cta", from: 648, y: 300, tracking: 0.18, style: { background: { color: TEAL, paddingPx: 30, radiusPx: 44 } } });
  on(cta, 50, 14, [cv("offsetY", 40, 0, "spring(180,18,1)"), cv("opacity", 0, 1, "easeOut")]);
}

// ---------------------------------------------------------------------------
// The music: DR-1 drums and a BL-1 acid line, in the document so the editor
// plays them. The render does not mix audio.

function musicClips() {
  const beatTick = MIDI_PPQ;
  const notes = (list) => list.map(([beat, pitch, len = 0.25, velocity = 100]) => ({ id: nid("n"), pitch, velocity, startTick: Math.round(beat * beatTick), durationTick: Math.max(1, Math.round(len * beatTick)) }));
  const KICK = 36, CLAP = 39, HAT = 41, OPEN = 42, CRASH = 47, GLITCH = 51;
  const drums = [];
  // Intro: a heartbeat kick and the flicker's glitch hits.
  for (const b of [0, 2, 4, 4.5]) drums.push([b, KICK, 0.25, 110]);
  drums.push([3, GLITCH, 0.25, 90], [3.25, GLITCH, 0.25, 70]);
  // The drop at beat 6 through the specs.
  for (let b = 6; b < 35; b++) {
    drums.push([b, KICK, 0.25, 118]);
    if (b % 2 === 1) drums.push([b, CLAP, 0.25, 104]);
    drums.push([b + 0.5, HAT, 0.125, 76], [b + 0.75, HAT, 0.125, 58]);
    if (b % 4 === 3) drums.push([b + 0.5, OPEN, 0.25, 80]);
  }
  for (const b of [6, 14, 24, 35, 40]) drums.push([b, CRASH, 1, 112]);
  // The reveal is half time; the drop card rebuilds to one last hit.
  for (let b = 35; b < 40; b += 2) drums.push([b, KICK, 0.25, 110], [b + 1, CLAP, 0.25, 96]);
  for (let b = 40; b < 45; b++) drums.push([b, KICK, 0.25, 115], [b + 0.5, HAT, 0.125, 70]);
  drums.push([45, KICK, 0.5, 127], [45, CRASH, 1, 127]);

  const E1 = 28, G1 = 31, A1 = 33, B0 = 23, D2 = 38;
  const riff = [E1, E1, D2, E1, G1, E1, A1, B0];
  const bass = [];
  for (let b = 6; b < 35; b++) {
    for (let h = 0; h < 2; h++) bass.push([b + h * 0.5, riff[(2 * b + h) % riff.length], 0.4, h === 0 ? 120 : 84]);
  }
  for (let b = 40; b < 45; b++) bass.push([b, E1, 0.9, 110]);

  const clip = (id, trackId, list) => ({
    id, name: id, trackId, startMs: 0, durationMs: ms(FRAMES), mediaType: "midi", sourceType: "imported", status: "generated", locked: false, versions: [],
    notes: notes(list)
  });
  return [clip("drums", "t_drums", drums), clip("bass", "t_bass", bass)];
}

// ---------------------------------------------------------------------------
// Assembly

buildS1(); buildS2(); buildS3(); buildS4(); buildS5(); buildS6();

const tracks = [
  { id: "t_finish", name: "finish", type: "video", index: 0, visible: true, locked: false },
  { id: "t_grade", name: "night grade", type: "video", index: 1, visible: true, locked: false },
  { id: "t_scenes", name: "scenes", type: "video", index: 2, visible: true, locked: false }
];
const clips = [];
// Later scenes sit above earlier ones, so an incoming scene covers the one it
// transitions from.
let offset = tracks.length;
for (const s of [...scenes].reverse()) {
  const slots = [...new Set(s.layers.map((clip) => clip._z))].sort((a, b) => a - b);
  const size = slots.length;
  slots.forEach((z, i) => {
    const t = { id: `t_${s.name}_${i}`, name: `${s.name} ${i}`, type: "video", index: offset + size - 1 - i, visible: true, locked: false };
    if (s.trackEffects.has(z)) t.effects = s.trackEffects.get(z);
    tracks.push(t);
  });
  for (const clip of s.layers) {
    clip.trackId = `t_${s.name}_${slots.indexOf(clip._z)}`;
    delete clip._z;
    delete clip._from;
    clips.push(clip);
  }
  offset += size;
}
tracks.push(
  { id: "t_drums", name: "drums", type: "midi", index: offset, visible: true, locked: false, instrument: findInstrumentPreset("dr1-tr-void").instrument },
  { id: "t_bass", name: "bass", type: "midi", index: offset + 1, visible: true, locked: false, instrument: findInstrumentPreset("bl1-acid").instrument }
);
tracks.sort((a, b) => a.index - b.index);
for (const s of scenes) clips.push(s.group);
clips.push(...musicClips());

clips.push({
  id: "night-grade", name: "teal & orange night grade", trackId: "t_grade", startMs: 0, durationMs: ms(365), mediaType: "adjustment", sourceType: "imported", status: "generated", locked: false, versions: [],
  effects: [
    { id: "lut", type: "lut", enabled: true, cube: tealOrangeCube(), intensity: 0.85 },
    { id: "crv", type: "curves", enabled: true, master: [{ x: 0, y: 0 }, { x: 0.25, y: 0.19 }, { x: 0.75, y: 0.83 }, { x: 1, y: 1 }], b: [{ x: 0, y: 0.04 }, { x: 1, y: 0.96 }] }
  ]
});
clips.push({
  id: "finish", name: "vignette + grain + sharpen", trackId: "t_finish", startMs: 0, durationMs: ms(FRAMES), mediaType: "adjustment", sourceType: "imported", status: "generated", locked: false, versions: [],
  effects: [
    { id: "sh", type: "sharpen", enabled: true, amount: 0.35, radius: 1.2 },
    { id: "vig", type: "vignette", enabled: true, amount: 0.35, softness: 0.65 },
    { id: "grain", type: "grain", enabled: true, amount: 0.05, size: 1.4, animate: true, seed: 2 }
  ]
});

// The pan across the board in S2. Its jumps sit on the two hard cuts either
// side of it, where nothing else is on screen to be moved.
const camera2d = {
  position: { x: 0, y: 0 }, depthPx: 0, focalLengthPx: 1800,
  keyframes: [
    { timeMs: 0, position: { x: 0, y: 0 }, depthPx: 0 },
    { timeMs: ms(150) - 1, position: { x: 0, y: 0 }, depthPx: 0 },
    { timeMs: ms(150), position: { x: -620, y: 0 }, depthPx: 0 },
    { timeMs: ms(209), position: { x: 620, y: 0 }, depthPx: 60 },
    { timeMs: ms(210) - 1, position: { x: 620, y: 0 }, depthPx: 60 },
    { timeMs: ms(210), position: { x: 0, y: 0 }, depthPx: 0 }
  ]
};

// The beat grid, through the same ops the editor's tempo tools run: markers on
// every beat, then the montage cuts snapped to it. A cut off the grid fails
// the build instead of shipping a drag.
let state = { fps: FPS, width: W, height: H, tracks, clips, markers: [], mediaTracks: [], playheadMs: 0, selectedClipIds: [] };
const opCtx = { newId: (kind) => nid(kind) };
const beats = Math.floor((ms(FRAMES) / 1000) * (BPM / 60));
for (const op of [
  { op: "set_markers_from_beats", bpm: BPM, offset_ms: 0, count: beats, label: "Beat" },
  { op: "snap_to_beats", targets: montageIds, bpm: BPM, offset_ms: 0, mode: "start", action: "move", tolerance_ms: 40 }
]) {
  const outcome = await applyTimelineOp(state, op, opCtx);
  if (outcome.error) throw new Error(`${op.op}: ${outcome.error}`);
  if (op.op === "snap_to_beats") {
    const off = outcome.result.clips.filter((c) => !c.snapped && c.reason !== "already on the grid");
    if (off.length) throw new Error(`montage cut off the beat: ${JSON.stringify(off)}`);
  }
  state = outcome.state;
}

const bundle = {
  name: "Voltra — Silent. Violent.",
  description: "A 23-second electric motorcycle launch ad cut to a 120 BPM beat: fifteen generated stills with parallax plates, masks, mattes, a night grade, spec gauges and a drop countdown.",
  fps: FPS,
  width: W,
  height: H,
  durationMs: ms(FRAMES),
  videoUri: "package://nodetool-base/timelines/voltra/ad.mp4",
  posterUri: "package://nodetool-base/timelines/voltra/poster.jpg",
  // Render output settings: a film-standard shutter over the whole ad. The
  // ride plates ask for a wider one of their own.
  render: { motionBlurSamples: 4, shutterAngle: 180 },
  document: { tracks: state.tracks, clips: state.clips, markers: state.markers, camera2d, tempo: { bpm: BPM, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } } }
};

const out = join(dirname(fileURLToPath(import.meta.url)), "../../packages/base-nodes/nodetool/examples/timelines/voltra.timeline.json");
writeFileSync(out, `${JSON.stringify(bundle)}\n`);
console.log(`${state.clips.length} clips, ${state.tracks.length} tracks, ${state.markers.length} markers -> ${out}`);
