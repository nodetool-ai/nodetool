// Prism: an 18-second launch ad for a fictional running shoe, built on four
// generated stills shot against chroma green and keyed out in the timeline.
//
// `node scripts/example-timelines/prism.mjs` writes the shipped bundle
// packages/base-nodes/nodetool/examples/timelines/prism.timeline.json.
// `node scripts/example-timelines/prism.mjs --stills [name…]` regenerates the
// stills (see prism-stills.mjs for every prompt and seed).
// `node scripts/render-example-timeline.mjs prism` renders its video and poster.
//
// Frames are at 30 fps on a 120 BPM grid, so one beat is 15 frames. The ad has
// no music yet: the tempo and the beat markers are in the document so a score
// can be laid on the cuts later, and the end card already pulses on the beat.
// Positions are px from the frame centre. Each scene is a group clip on the
// scenes track with its own tracks below it.
//
// Coverage. Mostly features the Kite, Serein and Voltra examples do not use.
// The transitions and text animators that repeat are there to vary the cuts.
//
// | Feature | Clip | Frame |
// |---|---|---|
// | `chromaKey` on generated green-screen stills | `shoe` (S3), `sole`, `colourway` (S4), `athlete` (S5) | 180 |
// | Stylize `edgeHighlight` rim on a keyed cutout | `shoe` (S3) | 180 |
// | Stylize `lensFlare` in an adjustment layer | `flare` (S3) | 152 |
// | Stylize `turbulence`, `innerShadow`, `innerGlow`, `lightLeakOverlay` | `knit`, `card-a`, `energy` (S4), `leak` (S6) | 262 |
// | Generators `conicGradient`, `meshGradient`, `fractal`, `noise`, `gridPattern` | `colour-bg` (S2), `mesh`, `fractal` (S3), `card-c-noise` (S4), `floor` (S5) | 110 |
// | `pixelate` cell size animated to 1 (a depixelate reveal) | `knit` (S4) | 250 |
// | `posterize` | `colourway` (S4) | 350 |
// | `color` effect in the finishing adjustment | `finish` | 180 |
// | `star` and `polygon` shapes | `spark-*` (S1), `hex` (S4) | 40 |
// | Path morph through a `shape.d` style track | `logo` (S6) | 470 |
// | `trimStart` chasing `trimEnd` along a stroke | `ray-*` (S1), `streak` (S5) | 45 |
// | Text on a path, tilted in 3D and spinning | `orbit-type` (S3) | 200 |
// | Outline text (`stroke` over a clear fill), italic type | `in` (S2), `marquee` (S3) | 80 |
// | Per-glyph `glyph.color`, `glyph.blurPx`, `glyph.trackingPx` | `every` (S2), `title` (S3), `tagline` (S6) | 96 |
// | Gradient text fill with an animated angle | `wordmark` (S6) | 500 |
// | Repeater grid with `columns`, `rowStep`, `timeStepMs`, `colorStep` | `in` (S2), `marquee` (S3), `hex`, `colourway` (S4), `trail` (S5) | 80 |
// | Hue-stepped delayed copies as a motion trail | `trail` (S5) | 395 |
// | `animationLinks`: a wiggle, and a glow following the shoe | `shoe`, `floor-glow` (S3) | 200 |
// | `steppedTime` at 12 fps | `line-*` (S5) | 370 |
// | Hue, and a generator's angle, animated | `colour-bg` (S2) | 110 |
// | Presets `pop`, `shake`, `spin`, `float`, `rotate`, `hueShift`, `kenBurns`, `pulse` | across S1–S6 | 65 |
// | Animations anchored to sequence beats | `logo` pulses (S6) | 465 |
// | `scramble` and `ticker` text | `intro` (S3), `weight`, `energy` (S4) | 270 |
// | `iris`, `gradientWipe` (noise map), `push`, `slide`, `zoomBlur`, `dipToColor` | S3, S4, `card-b`, `card-c`, S5, S6 | 243 |
// | Tempo and beat markers without music, cuts checked against the grid | `word-*` (S2) | 75 |
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createBuilder, cv, kfs, NOOP, rad, track } from "./lib.mjs";
import { generateStills, stillUri } from "./prism-stills.mjs";

if (process.argv[2] === "--stills") {
  await generateStills(process.argv.slice(3));
  process.exit(0);
}

const W = 1920, H = 1080, FPS = 30, FRAMES = 540, BPM = 120;

const INK = "#07060b", TEXT = "#ffffff", DIM = "#b9b3c9", CLEAR = "rgba(0,0,0,0)";
const LIME = "#d4ff3a", MAGENTA = "#ff2bd6", CYAN = "#22e1ff", VIOLET = "#7b3dff";
const SPECTRUM = ["#ff3b5c", "#ff9a1f", "#ffe14d", "#3dff8f", "#22e1ff", "#8b5cf6"];
const RAINBOW = { type: "linear", angle: 0, stops: SPECTRUM.map((color, i) => ({ offset: i / (SPECTRUM.length - 1), color })) };
const SANS = "Inter", MONO = "JetBrains Mono";
const ITALIC = { fontStyle: "italic" };
const SNAP = "cubic-bezier(0.16,1,0.3,1)", EASE_IO = "cubic-bezier(0.65,0,0.35,1)";

// The key colour sampled from the stills' background, and a mask under each
// subject that drops the floor shadow the key leaves behind.
const KEY = (id) => ({ id, type: "chromaKey", enabled: true, color: "#0ac300", tolerance: 0.3, softness: 0.16, spill: 0.9 });
const ABOVE_FLOOR = (height) => ({ kind: "rect", x: 0, y: 0, width: 1, height });

// ---------------------------------------------------------------------------
// Document plumbing

const { ms, nid, scenes, current, scene, group, image: asset, adjust, box, ellipse, path, pathData, text, on, across, loop, sceneTracks, beatGrid } = createBuilder({ W, H, FPS, font: SANS });
const image = (still, o = {}) => asset(stillUri(still), { name: still, ...o });

/** A catalog preset starting at scene frame `f0`. A loop's `dur` is its period. */
function preset(clip, id, role, f0, dur, params = {}, extra = {}) {
  const delayMs = role === "loop" ? 0 : ms(current().start + f0) - clip.startMs;
  clip.animations = [...(clip.animations ?? []), { id: nid("a"), role, preset: id, delayMs, durationMs: ms(dur), params, ...extra }];
  return clip;
}

/** Text that slams in: large to rest size, out of a blur. */
function slam(clip, f0, from = 1.4) {
  on(clip, f0, 8, [cv("scale", from, 1, SNAP), cv("blur", 24, 0, "easeOut")]);
  return on(clip, f0, 3, [cv("opacity", 0, 1, "linear")]);
}

const glow = (color, radius = 24, intensity = 1) => ({ id: nid("g"), type: "glow", enabled: true, radius, intensity, color });

// ---------------------------------------------------------------------------
// The prism: a triangle with a vertex at each edge midpoint, so the same six
// points can morph into a three-pointed star.

function prismPoints(r, pinch = 1) {
  const outer = [[0, -r], [0.866 * r, 0.5 * r], [-0.866 * r, 0.5 * r]];
  const mid = (a, b) => [((a[0] + b[0]) / 2) * pinch, ((a[1] + b[1]) / 2) * pinch];
  const points = [outer[0], mid(outer[0], outer[1]), outer[1], mid(outer[1], outer[2]), outer[2], mid(outer[2], outer[0])];
  return points;
}

const closed = (points, x = 0, y = 0) => [...points.map(([px, py], i) => [i ? "L" : "M", x + px, y + py]), ["Z"]];

/** A circle of cubic segments, centred on the frame, starting at the top and running clockwise. */
function circle(r) {
  const k = 0.5523 * r;
  return [["M", 0, -r], ["C", k, -r, r, -k, r, 0], ["C", r, k, k, r, 0, r], ["C", -k, r, -r, k, -r, 0], ["C", -r, -k, -k, -r, 0, -r]];
}

/**
 * A white beam enters the prism's left face and leaves its right face as six
 * spectrum rays. The rays draw on from `f0`; `chase` frames later their tails
 * follow, so the light travels out of frame.
 */
function prismBeams({ x = 0, y = 0, r = 150, f0 = 0, reach = 1000, chase = null, sw = 1 }) {
  const enter = [x - 0.433 * r, y - 0.25 * r], exit = [x + 0.433 * r, y - 0.25 * r];
  const beam = path([["M", x - reach, y + 0.6 * r], ["L", ...enter]], { name: "beam", stroke: TEXT, sw: 6 * sw, effects: [glow("#ffffff", 20, 1.2)] });
  on(beam, f0, 10, [cv("trimEnd", 0, 1, "easeIn")]);
  SPECTRUM.forEach((color, i) => {
    const spread = (i - (SPECTRUM.length - 1) / 2) * 0.22 * reach;
    const ray = path([["M", ...exit], ["L", x + reach, y + spread]], { name: `ray-${i}`, stroke: color, sw: 10 * sw, effects: [glow(color, 28, 1.1)] });
    on(ray, f0 + 9 + i, 12, [cv("trimEnd", 0, 1, SNAP)]);
    if (chase !== null) on(ray, f0 + chase + i, 14, [cv("trimStart", 0, 1, "easeIn")]);
  });
  return { enter, exit };
}

// ---------------------------------------------------------------------------
// S1 Split (0–59): a beam hits a prism and fans out into the spectrum.

function buildS1() {
  scene("S1", 0, 59);
  box(W, H, INK, { name: "ink" });
  const grid = box(W, H, INK, { name: "grid", opacity: 0.35, effects: [{ id: "gp", type: "generator", enabled: true, mode: "gridPattern", amount: 1, scale: 24, colorA: INK, colorB: "#241d38" }] });
  preset(grid, "kenBurns", "loop", 0, 60, { zoom: 0.06, direction: "in", driftX: 0, driftY: 0 });

  prismBeams({ r: 150, f0: 2, chase: 30 });
  const prism = path(closed(prismPoints(150)), { name: "prism", stroke: TEXT, sw: 5, fill: "rgba(255,255,255,0.06)", effects: [glow("#e9e4ff", 30, 1)] });
  preset(prism, "pop", "in", 0, 10, { overshoot: 1.2 });

  // Sparks where the rays leave the frame, spinning in one after another.
  [[620, -320, 70], [760, -120, 44], [560, 90, 56], [820, 250, 38], [640, 360, 50]].forEach(([x, y, size], i) => {
    const spark = box(size, size, SPECTRUM[i + 1], { name: `spark-${i}`, kind: "star", x, y, from: 20 + i * 2, shape: { sides: 4, innerRadius: 0.22 }, effects: [glow(SPECTRUM[i + 1], 18, 1.2)] });
    preset(spark, "spin", "in", 20 + i * 2, 10, { turns: 0.5 });
  });

  const kicker = text("LIGHT, SPLIT.", 30, 500, DIM, { name: "kicker", font: MONO, from: 24, y: 420, style: { letterSpacingPx: 10 } });
  on(kicker, 24, 10, [cv("opacity", 0, 1, "easeOut")]);

  // White-out into the first word.
  const flash = box(W, H, TEXT, { name: "flash", from: 52 });
  on(flash, 52, 8, [cv("opacity", 0, 1, "easeIn")]);
}

// ---------------------------------------------------------------------------
// S2 The words (60–125): one word per beat, each on its own ground, hard cuts.

const wordIds = [];

function word(name, from, to, ground) {
  const g = group({ name: `word-${name}`, id: `word-${name}`, slot: "word", from, to });
  wordIds.push(g.id);
  const bg = typeof ground === "string"
    ? box(W, H, ground, { name: `${name}-bg`, parent: g.id, from, to })
    : box(W, H, INK, { name: `${name}-bg`, parent: g.id, from, to, effects: [ground] });
  return { g, bg, o: { parent: g.id, from, to } };
}

function buildS2() {
  scene("S2", 60, 125);

  // RUN: pops in past full size, then shakes.
  const run = word("run", 60, 74, LIME);
  const r = text("RUN", 560, 900, INK, { ...run.o, name: "run", y: 20, tracking: -0.03, style: ITALIC });
  preset(r, "pop", "in", 0, 6, { overshoot: 1.25 });
  preset(r, "shake", "emphasis", 5, 10, { intensity: 0.012, frequency: 16, seed: 3 });

  // IN: an outline word repeated over a grid, each copy a step later and a
  // step round the hue wheel.
  const inW = word("in", 75, 89, MAGENTA);
  const i = text("IN", 300, 900, CLEAR, {
    ...inW.o, name: "in", x: -800, y: -340, mw: 0.3, style: { ...ITALIC, stroke: { color: LIME, widthPx: 7 } },
    repeater: { count: 15, columns: 5, positionStep: { x: 400, y: 0 }, rowStep: { x: 0, y: 340 }, timeStepMs: 12, colorStep: { hueDegrees: 24 } }
  });
  on(i, 15, 6, [cv("scale", 0.3, 1, SNAP), cv("opacity", 0, 1, "linear")]);

  // EVERY: the letters rise one after another, each cycling through the spectrum.
  const every = word("every", 90, 104, INK);
  const e = text("EVERY", 400, 900, TEXT, { ...every.o, name: "every", y: 10, tracking: -0.02, style: ITALIC });
  on(e, 30, 10, [kfs("offsetY", [[0, 90], [0.6, 0, SNAP], [1, 0, "linear"]]), kfs("opacity", [[0, 0], [0.25, 1, "linear"], [1, 1, "linear"]])], {
    stagger: { unit: "character", offsetMs: 30 },
    styleTracks: [track("glyph.color", [[0, LIME], [0.25, MAGENTA], [0.5, CYAN], [0.75, SPECTRUM[2]], [1, TEXT]])]
  });

  // COLOUR.: over a conic gradient that turns while its hue cycles.
  const colour = word("colour", 105, 125, { id: "cg", type: "generator", enabled: true, mode: "conicGradient", amount: 1, angle: 0, colorA: MAGENTA, colorB: CYAN });
  colour.bg.name = "colour-bg";
  across(colour.bg, [NOOP], { styleTracks: [track("effect.cg.angle", [[0, 0], [1, 300, "linear"]])] });
  preset(colour.bg, "hueShift", "loop", 0, 30);
  const c = text("COLOUR.", 330, 900, TEXT, {
    ...colour.o, name: "colour", y: 10, tracking: -0.02, style: { ...ITALIC, stroke: { color: INK, widthPx: 12 } },
    effects: [{ id: "cs", type: "stylize", enabled: true, mode: "rgbSplit", amount: 0, angle: 0 }]
  });
  slam(c, 45, 1.5);
  on(c, 45, 10, [NOOP], { styleTracks: [track("effect.cs.amount", [[0, 34], [1, 0, "easeOut"]])] });
}

// ---------------------------------------------------------------------------
// S3 The reveal (120–248): the keyed shoe flies onto a mesh gradient, ringed
// by type that orbits it.

function buildS3() {
  scene("S3", 120, 248, { transitionIn: { type: "iris", durationMs: 200, softness: 0.08, easing: "easeIn" } });
  box(W, H, INK, { name: "mesh", effects: [{ id: "mg", type: "generator", enabled: true, mode: "meshGradient", amount: 1, scale: 5, animate: true, colorA: "#12002e", colorB: VIOLET }] });
  box(W, H, INK, { name: "fractal", blendMode: "screen", opacity: 0.4, effects: [{ id: "fr", type: "generator", enabled: true, mode: "fractal", amount: 1, scale: 3, animate: true, seed: 7, colorA: "#000000", colorB: MAGENTA }] });

  // Three rows of outline "PRISM", scrolling left one copy per loop.
  const marquee = text("PRISM", 300, 900, CLEAR, {
    name: "marquee", x: -1575, y: -340, mw: 0.6, style: { ...ITALIC, stroke: { color: "rgba(255,255,255,0.22)", widthPx: 3 } },
    repeater: { count: 12, columns: 4, positionStep: { x: 1050, y: 0 }, rowStep: { x: 525, y: 340 }, timeStepMs: 0 }
  });
  loop(marquee, 75, [kfs("offsetX", [[0, 0], [1, -1050, "linear"]])]);

  // The ring of type: a circle path, tilted back in 3D, turning slowly.
  const ring = "PRISM RUNNER  •  RUN IN EVERY COLOUR  •  PRISM RUNNER  •  RUN IN EVERY COLOUR  •  ";
  const tilt = group({ name: "orbit-tilt", from: 150, tx: { rotationX: 66, perspective: 1600 } });
  const orbit = text(ring, 40, 700, TEXT, { name: "orbit-type", parent: tilt.id, from: 150, tracking: 0.25, style: { path: pathData(circle(470)) } });
  preset(orbit, "rotate", "loop", 0, 360, { direction: "ccw" });
  on(orbit, 30, 16, [cv("opacity", 0, 0.85, "easeOut")]);

  // The shoe: keyed, rimmed in cyan, whipped in with a 3D swing and a wide
  // shutter, then floating. The wiggle and the float run on the shoe, the
  // entrance on its rig, so they compose.
  const glowUnder = ellipse(1000, { type: "radial", stops: [{ offset: 0, color: "rgba(255,43,214,0.75)" }, { offset: 0.35, color: "rgba(34,225,255,0.25)" }, { offset: 0.7071, color: "rgba(34,225,255,0)" }] },
    { name: "floor-glow", from: 140, tx: { scale: { x: 1.2, y: 0.22 } } });
  on(glowUnder, 20, 14, [cv("opacity", 0, 1, "easeOut")]);
  const rig = group({ name: "shoe-rig", tx: { perspective: 1600 } });
  on(rig, 4, 24, [cv("offsetX", 1500, 0, SNAP), cv("rotationY", -70, 0, SNAP), cv("rotation", rad(-14), 0, SNAP)]);
  const shoe = image("shoe", {
    name: "shoe", id: "shoe", parent: rig.id, y: -30, s: 0.95, mask: ABOVE_FLOOR(0.79),
    motionBlur: { samplesPerFrame: 8, shutterAngle: 270 },
    effects: [KEY("key"), { id: "eh", type: "stylize", enabled: true, mode: "edgeHighlight", amount: 1.4, scale: 5, color: CYAN }]
  });
  preset(shoe, "float", "loop", 0, 90, { amplitude: 0.014, frequency: 0.6, seed: 2 });
  shoe.animationLinks = [{ target: "rotation", kind: "wiggle", amplitude: 0.025, frequencyHz: 0.7, seed: 5 }];
  glowUnder.animationLinks = [{ target: "positionY", sourceClipId: shoe.id, source: "positionY", offset: 360 }];

  // An anamorphic flare across the whole picture as the shoe lands.
  const flare = adjust([{ id: "lf", type: "stylize", enabled: true, mode: "lensFlare", amount: 0, scale: 2.5, angle: 0, color: "#bfefff" }], { name: "flare" });
  across(flare, [NOOP], { styleTracks: [track("effect.lf.amount", [[0, 0], [0.19, 0, "linear"], [0.25, 1.8, "easeOut"], [0.6, 0.5, "easeOut"], [1, 0.4, "linear"]])] });

  const intro = text("INTRODUCING", 28, 500, LIME, { name: "intro", font: MONO, from: 165, y: 330, style: { letterSpacingPx: 12 } });
  on(intro, 45, 14, [NOOP], { textAnimator: { kind: "scramble", seed: 3 } });
  const title = text("PRISM RUNNER", 96, 900, TEXT, { name: "title", from: 170, y: 410, tracking: 0.06, style: ITALIC });
  on(title, 50, 20, [cv("opacity", 0, 1, "easeOut")], {
    stagger: { unit: "character", offsetMs: 25 },
    styleTracks: [track("glyph.blurPx", [[0, 24], [1, 0, "easeOut"]]), track("glyph.trackingPx", [[0, 40], [1, 0, SNAP]])]
  });
}

// ---------------------------------------------------------------------------
// S4 The specs (240–366): three cards, one detail each.

function specLabel(str, o) {
  return text(str, 28, 500, o.color ?? INK, { font: MONO, anchor: "left", mw: 0.4, style: { letterSpacingPx: 4 }, ...o });
}

function buildS4() {
  scene("S4", 240, 366, { transitionIn: { type: "gradientWipe", durationMs: 300, direction: "right", map: "noise", scale: 4, seed: 9, softness: 0.2, easing: EASE_IO } });

  // A: the knit, depixelating into focus under a slow turbulence.
  const a = group({ name: "card-a-scene", slot: "card", from: 240, to: 284 });
  const ao = { parent: a.id, from: 240, to: 284 };
  const knit = image("knit", {
    ...ao, name: "knit", effects: [
      { id: "px", type: "pixelate", enabled: true, cellSize: 1 },
      { id: "tb", type: "stylize", enabled: true, mode: "turbulence", amount: 0.4, scale: 3, animate: true, seed: 4 }
    ]
  });
  across(knit, [NOOP], { styleTracks: [track("effect.px.cellSize", [[0, 120], [0.35, 1, "easeOut"], [1, 1, "linear"]])] });
  preset(knit, "kenBurns", "loop", 0, 44, { zoom: 0.1, direction: "in", driftX: 0.02, driftY: 0 });
  const cardA = group({ ...ao, name: "card-a", x: -500, y: 250 });
  box(700, 300, TEXT, { ...ao, parent: cardA.id, name: "card-a-panel", r: 40, effects: [
    { id: "is", type: "stylize", enabled: true, mode: "innerShadow", amount: 1, scale: 10, angle: 90, color: "#cfc8e6" },
    { id: "ds", type: "dropShadow", enabled: true, offsetX: 0, offsetY: 30, blur: 60, color: "rgba(0,0,0,0.5)" }
  ] });
  specLabel("HOLO-KNIT UPPER", { ...ao, parent: cardA.id, name: "label-a", x: -310, y: -90 });
  const weight = text("198 G", 170, 900, INK, { ...ao, parent: cardA.id, name: "weight", anchor: "left", mw: 0.4, x: -314, y: 40, style: ITALIC });
  on(weight, 10, 18, [NOOP], { textAnimator: { kind: "ticker", from: 0, to: 198, suffix: " G" }, easing: EASE_IO });
  preset(cardA, "pop", "in", 6, 10, { overshoot: 1.08 });

  // B: the sole over a cascading hex lattice, energy counting up.
  const b = group({ name: "card-b", slot: "card", from: 280, to: 324, transitionIn: { type: "push", durationMs: 130, direction: "up", easing: SNAP } });
  const bo = { parent: b.id, from: 280, to: 324 };
  box(W, H, INK, { ...bo, name: "card-b-ink" });
  const hex = box(180, 180, null, {
    ...bo, name: "hex", kind: "polygon", x: -1010, y: -520, stroke: MAGENTA, sw: 5, opacity: 0.85, shape: { sides: 6 },
    repeater: { count: 96, columns: 16, positionStep: { x: 156, y: 0 }, rowStep: { x: -78, y: 135 }, timeStepMs: 10, colorStep: { hueDegrees: 4 } }
  });
  on(hex, 40, 10, [cv("scale", 0, 1, "spring(260,14,1)")]);
  const sole = image("sole", { ...bo, name: "sole", x: 360, s: 0.85, tx: { perspective: 1400 }, effects: [KEY("sole-key"), glow(CYAN, 30, 0.35)] });
  on(sole, 40, 16, [cv("rotationX", 55, 0, SNAP), cv("offsetY", 220, 0, SNAP), cv("opacity", 0, 1, "linear")]);
  across(sole, [kfs("rotation", [[0, rad(-6)], [1, rad(3), "linear"]])]);
  const label = specLabel("ENERGY RETURN", { ...bo, name: "label-b", color: LIME, x: -860, y: -170 });
  on(label, 44, 12, [NOOP], { textAnimator: { kind: "scramble", seed: 8 } });
  const energy = text("87%", 280, 900, TEXT, {
    ...bo, name: "energy", anchor: "left", mw: 0.4, x: -864, y: -10, style: ITALIC,
    effects: [{ id: "ig", type: "stylize", enabled: true, mode: "innerGlow", amount: 1.2, scale: 9, color: MAGENTA }]
  });
  on(energy, 42, 20, [NOOP], { textAnimator: { kind: "ticker", from: 0, to: 87, suffix: "%" }, easing: EASE_IO });
  text("PRISM FOAM MIDSOLE", 36, 600, DIM, { ...bo, name: "foam", anchor: "left", mw: 0.4, x: -860, y: 150, tracking: 0.12 });

  // C: four colourways in a grid, a quarter turn of hue apart.
  const cc = group({ name: "card-c", slot: "card", from: 320, to: 366, transitionIn: { type: "slide", durationMs: 130, direction: "left", easing: SNAP } });
  const co = { parent: cc.id, from: 320, to: 366 };
  box(W, H, INK, { ...co, name: "card-c-ink" });
  box(W, H, INK, { ...co, name: "card-c-noise", opacity: 0.5, effects: [{ id: "nz", type: "generator", enabled: true, mode: "noise", amount: 0.35, scale: 3, animate: true, seed: 11, colorA: INK, colorB: "#4a4366" }] });
  const way = image("shoe", {
    ...co, name: "colourway", x: -440, y: -240, s: 0.46, mask: ABOVE_FLOOR(0.79),
    effects: [{ id: "pz", type: "posterize", enabled: true, levels: 6 }, KEY("way-key")],
    repeater: { count: 4, columns: 2, positionStep: { x: 880, y: 0 }, rowStep: { x: 0, y: 470 }, timeStepMs: 70, colorStep: { hueDegrees: 90 } }
  });
  on(way, 80, 12, [cv("scale", 0.4, 1, "spring(220,15,1)"), cv("opacity", 0, 1, "linear")]);
  const ways = text("4 COLOURWAYS", 64, 900, INK, { ...co, name: "ways", y: 0, tracking: 0.04, style: { ...ITALIC, background: { color: LIME, paddingPx: 28, radiusPx: 48 } } });
  preset(ways, "pop", "in", 88, 10, { overshoot: 1.15 });
}

// ---------------------------------------------------------------------------
// S5 The leap (360–460): the sprinter crosses a neon grid, trailing the spectrum.

function buildS5() {
  scene("S5", 360, 460, { transitionIn: { type: "zoomBlur", durationMs: 200, blur: 1, easing: "easeIn" } });
  box(W, H, { type: "linear", angle: 90, stops: [{ offset: 0, color: INK }, { offset: 0.55, color: "#2b0a4f" }, { offset: 1, color: MAGENTA }] }, { name: "sky" });
  const sun = ellipse(620, { type: "linear", angle: 90, stops: [{ offset: 0, color: LIME }, { offset: 1, color: MAGENTA }] }, { name: "sun", y: -40, effects: [glow(MAGENTA, 60, 0.9)] });
  on(sun, 0, 20, [cv("offsetY", 120, 0, SNAP)]);
  box(W, H, INK, {
    name: "floor", y: 420, s: 1, tx: { scale: { x: 3, y: 1 }, rotationX: 72, perspective: 700 },
    effects: [{ id: "fg", type: "generator", enabled: true, mode: "gridPattern", amount: 1, scale: 22, colorA: "#0d0420", colorB: CYAN }, glow(CYAN, 12, 0.6)]
  });

  // Streaks racing right to left, their heads and tails both moving.
  const streak = path([["M", 980, 0], ["L", -980, 0]], {
    name: "streak", stroke: CYAN, sw: 4, y: -330, opacity: 0.8,
    repeater: { count: 6, columns: 1, positionStep: { x: 0, y: 0 }, rowStep: { x: 0, y: 95 }, timeStepMs: 90, colorStep: { hueDegrees: 55 } }
  });
  loop(streak, 16, [kfs("trimEnd", [[0, 0], [0.5, 1, "easeIn"], [1, 1, "linear"]]), kfs("trimStart", [[0, 0], [0.5, 0, "linear"], [1, 1, "easeOut"]])]);

  // The sprinter: one keyed copy on top, and under it a trail of delayed
  // copies, each a step round the hue wheel.
  const motion = [
    kfs("offsetX", [[0, -1500], [0.4, -160, "cubic-bezier(0.33,1,0.68,1)"], [0.6, 160, "linear"], [1, 1700, "easeIn"]]),
    kfs("offsetY", [[0, 260], [0.5, 170, "easeOut"], [1, 260, "easeIn"]])
  ];
  const athlete = (name, extra) => across(image("athlete", { name, s: 0.8, mask: ABOVE_FLOOR(0.855), effects: [KEY(`${name}-key`)], ...extra }), motion);
  athlete("trail", { opacity: 0.75, repeater: { count: 6, columns: 6, positionStep: { x: 0, y: 0 }, timeStepMs: 80, colorStep: { hueDegrees: 55 } } });
  athlete("athlete", { effects: [KEY("athlete-key"), { id: "ah", type: "stylize", enabled: true, mode: "edgeHighlight", amount: 1, scale: 4, color: LIME }] });

  // Two lines, stepped at 12 fps like stop motion.
  [["LIGHT BENDS.", 360, 404], ["SO DO RECORDS.", 405, 460]].forEach(([str, from, to], i) => {
    const line = text(str, 170, 900, TEXT, { name: `line-${i}`, slot: "line", from, to, y: -380, tracking: -0.01, style: ITALIC, steppedTime: { fps: 12 }, ...(i === 1 && { fill: RAINBOW }) });
    on(line, from - 360, 12, [cv("offsetY", 70, 0, SNAP), cv("opacity", 0, 1, "linear")], { stagger: { unit: "word", offsetMs: 130 } });
  });
}

// ---------------------------------------------------------------------------
// S6 The end card (450–539): the prism becomes a star, pulsing on the beat.

function buildS6() {
  scene("S6", 450, 539, { transitionIn: { type: "dipToColor", durationMs: 330, color: "#ffffff", easing: "easeInOut" } });
  box(W, H, INK, { name: "ink" });
  ellipse(1400, { type: "radial", stops: [{ offset: 0, color: "rgba(123,61,255,0.45)" }, { offset: 0.7071, color: "rgba(123,61,255,0)" }] }, { name: "halo", y: -200 });

  const LX = 0, LY = -250, LR = 90;
  prismBeams({ x: LX, y: LY, r: LR, f0: 4, reach: 760, sw: 0.6 });
  const tri = pathData(closed(prismPoints(LR), LX, LY)), star = pathData(closed(prismPoints(LR, 0.3), LX, LY));
  const logo = path(closed(prismPoints(LR), LX, LY), { name: "logo", stroke: TEXT, sw: 5, fill: "rgba(255,255,255,0.08)", effects: [glow("#e9e4ff", 30, 1.1)] });
  across(logo, [NOOP], { styleTracks: [track("shape.d", [[0, tri], [0.2, tri, "linear"], [0.32, star, SNAP], [1, star, "linear"]])] });
  // One pulse on each beat from the one after the morph lands to the end.
  for (let beat = 33; beat <= 36; beat++) {
    logo.animations.push({ id: nid("a"), role: "emphasis", preset: "pulse", durationMs: 300, beat: { index: beat, scope: "sequence" }, params: { intensity: 0.1 } });
  }

  const wordmark = text("PRISM", 300, 900, TEXT, { name: "wordmark", from: 462, y: 20, tracking: -0.02, fill: RAINBOW, style: ITALIC });
  slam(wordmark, 12, 1.5);
  across(wordmark, [NOOP], { styleTracks: [track("text.fill.angle", [[0, 0], [1, 120, "linear"]])] });
  const tagline = text("RUN IN EVERY COLOUR.", 42, 600, TEXT, { name: "tagline", from: 474, y: 200, tracking: 0.28 });
  on(tagline, 24, 16, [cv("opacity", 0, 1, "easeOut")], { stagger: { unit: "character", offsetMs: 18 }, styleTracks: [track("glyph.trackingPx", [[0, 30], [1, 0, SNAP]])] });
  const cta = text("PRE-ORDER NOW  ·  10.03", 44, 800, INK, { name: "cta", from: 486, y: 330, tracking: 0.12, style: { background: { color: LIME, paddingPx: 30, radiusPx: 48 } } });
  on(cta, 36, 14, [cv("offsetY", 40, 0, "spring(180,18,1)"), cv("opacity", 0, 1, "easeOut")]);

  adjust([{ id: "ll", type: "stylize", enabled: true, mode: "lightLeakOverlay", amount: 0.5, scale: 1.4, animate: true, seed: 3, color: MAGENTA }], { name: "leak" });
}

// ---------------------------------------------------------------------------
// Assembly

buildS1(); buildS2(); buildS3(); buildS4(); buildS5(); buildS6();

const tracks = [
  { id: "t_finish", name: "finish", type: "video", index: 0, visible: true, locked: false },
  { id: "t_scenes", name: "scenes", type: "video", index: 1, visible: true, locked: false }
];
const layers = sceneTracks(tracks.length);
const clips = [...layers.clips];
tracks.push(...layers.tracks);
tracks.sort((a, b) => a.index - b.index);
for (const s of scenes) clips.push(s.group);

clips.push({
  id: "finish", name: "saturation + vignette + grain", trackId: "t_finish", startMs: 0, durationMs: ms(FRAMES), mediaType: "adjustment", sourceType: "imported", status: "generated", locked: false, versions: [],
  effects: [
    { id: "sat", type: "color", enabled: true, saturation: 1.1, contrast: 1.05 },
    { id: "vig", type: "vignette", enabled: true, amount: 0.18, softness: 0.8 },
    { id: "grain", type: "grain", enabled: true, amount: 0.04, size: 1.3, animate: true, seed: 5 }
  ]
});

// Markers on every beat, and the word cuts snapped to them.
const state = await beatGrid(tracks, clips, { bpm: BPM, durationMs: ms(FRAMES), snap: wordIds });

const bundle = {
  name: "Prism — Run in Every Colour",
  description: "An 18-second running-shoe launch ad on a 120 BPM grid: green-screen stills keyed in the timeline, generated grounds, a prism that splits light, orbiting type, spectrum trails and a beat-pulsing end card.",
  fps: FPS,
  width: W,
  height: H,
  durationMs: ms(FRAMES),
  videoUri: "package://nodetool-base/timelines/prism/ad.mp4",
  posterUri: "package://nodetool-base/timelines/prism/poster.jpg",
  document: { tracks: state.tracks, clips: state.clips, markers: state.markers, tempo: { bpm: BPM, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } } }
};

const out = join(dirname(fileURLToPath(import.meta.url)), "../../packages/base-nodes/nodetool/examples/timelines/prism.timeline.json");
writeFileSync(out, `${JSON.stringify(bundle)}\n`);
console.log(`${state.clips.length} clips, ${state.tracks.length} tracks, ${state.markers.length} markers -> ${out}`);
