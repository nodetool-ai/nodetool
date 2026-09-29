// Prism: an 18-second launch ad for a fictional running shoe, built on four
// generated stills shot against chroma green and keyed out in the timeline.
//
// `node scripts/example-timelines/build.mjs prism` writes the shipped bundle
// packages/base-nodes/nodetool/examples/timelines/prism.timeline.json.
// `node scripts/example-timelines/prism-stills.mjs [name…]` regenerates the
// stills (see prism-stills.mjs for every prompt and seed).
//
// The piece runs on a 120 BPM grid (one beat = 0.5s), so every scene and cut
// in S2 lands on a beat by construction — no beat-snap pass needed. `v.beats`
// still writes the tempo and a marker per beat for a score to be laid on
// later, and the end card pulses on the beat through its own tail.
//
// Every time value below is seconds, local to the scene that authored it —
// `v.series()` is the only place a scene's position in the whole video is
// decided. Positions are px from the frame centre.
//
// Coverage. Mostly features the Kite example does not use.
//
// | Feature | Clip | Scene |
// |---|---|---|
// | `chromaKey` on generated green-screen stills | `shoe`, `sole`, `colourway`, `athlete` | S3–S5 |
// | Stylize `edgeHighlight` rim on a keyed cutout | `shoe`, `athlete` | S3, S5 |
// | Stylize `lensFlare` in an adjustment layer | `flare` | S3 |
// | Stylize `turbulence`, `innerShadow`, `innerGlow` | `knit`, `card-a-panel`, `energy` | S4 |
// | Generators `conicGradient`, `meshGradient`, `fractal`, `noise`, `gridPattern` | `colour-bg`, `mesh`, `fractal`, `card-c-noise`, `floor` | S2, S3, S4, S5 |
// | `pixelate` cell size tweened to 1 (a depixelate reveal) | `knit` | S4 |
// | `posterize` | `colourway` | S4 |
// | `color` effect in the finishing adjustment | `finish` | top-level |
// | `star` and `polygon` shapes | `spark-*`, `hex` | S1, S4 |
// | Path morph via `el.morph()` | `logo` | S6 |
// | `trimStart` chasing `trimEnd` along a stroke | `ray-*`, `streak-*` | S1, S5 |
// | Text on a path, tilted in 3D and spinning | `orbit-type` | S3 |
// | Outline text (stroke over a clear fill), italic type | `in`, `marquee` | S2, S3 |
// | Per-glyph `glyph.color` / `glyph.blurPx` / `glyph.trackingPx` tracks | `every`, `title`, `tagline` | S2, S3, S6 |
// | Gradient text fill, angle tweened | `wordmark` | S6 |
// | Repeater grid with `columns`, `rowStep`, `timeStepMs`, `colorStep` | `in`, `marquee`, `hex`, `colourway`, `trail` | S2–S5 |
// | Hue-stepped delayed copies as a motion trail | `trail` | S5 |
// | `animationLinks`: a wiggle on the shoe, a glow that follows it | `shoe`, `floor-glow` | S3 |
// | `steppedTime` at 12 fps | `line-0`, `line-1` | S5 |
// | Catalog presets `pop`, `shake`, `spin`, `float`, `rotate`, `hueShift`, `kenBurns`, `pulse` via `el.preset()` | across S1–S6 | — |
// | Text animators `el.scramble()`, `el.count()` | `intro`, `weight`, `energy`, `label-b` | S3, S4 |
// | `iris`, `gradientWipe` (noise map), `push`, `slide`, `zoomBlur`, `dipToColor` transitions | S2→S6, card cuts in S4 | — |
// | Tempo + beat markers via `v.beats`, every cut in S2 built directly on a beat | `word-*` | S2 |
import { video, hash } from "@nodetool-ai/sandbox-timeline";

const W = 1920, H = 1080, FPS = 30, BPM = 120;
const f = (frames) => frames / FPS; // a frame count from the reference cut, as seconds
const beat = (n) => (n * 60) / BPM; // the nth beat (0-based), in seconds

const INK = "#07060b", TEXT = "#ffffff", DIM = "#b9b3c9", CLEAR = "rgba(0,0,0,0)";
const LIME = "#d4ff3a", MAGENTA = "#ff2bd6", CYAN = "#22e1ff", VIOLET = "#7b3dff";
const SPECTRUM = ["#ff3b5c", "#ff9a1f", "#ffe14d", "#3dff8f", "#22e1ff", "#8b5cf6"];
const RAINBOW = { type: "linear", angle: 0, stops: SPECTRUM.map((color, i) => ({ offset: i / (SPECTRUM.length - 1), color })) };
const SANS = "Inter", MONO = "JetBrains Mono";
const SNAP = "cubic-bezier(0.16,1,0.3,1)", EASE_IO = "cubic-bezier(0.65,0,0.35,1)";

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: INK, ink2: "#12002e", text: TEXT, dim: DIM, accent: MAGENTA },
  fonts: { display: SANS, mono: MONO }
});

// The key colour sampled from the stills' background, and a mask under each
// subject that drops the floor shadow the key leaves behind.
const KEY = (id) => ({ id, type: "chromaKey", enabled: true, color: "#0ac300", tolerance: 0.3, softness: 0.16, spill: 0.9 });
const ABOVE_FLOOR = (height) => ({ kind: "rect", x: 0, y: 0, width: 1, height });
const image = (s, still, o = {}) => s.image(`package://nodetool-base/timelines/prism/${still}.jpg`, { name: still, ...o });
let idc = 0;
const glow = (color, radius = 24, intensity = 1) => ({ id: `g${++idc}`, type: "glow", enabled: true, radius, intensity, color });

// ---------------------------------------------------------------------------
// The prism: a triangle with a vertex at each edge midpoint, so the same six
// points can morph into a three-pointed star.

function prismPoints(r, pinch = 1) {
  const outer = [[0, -r], [0.866 * r, 0.5 * r], [-0.866 * r, 0.5 * r]];
  const mid = (a, b) => [((a[0] + b[0]) / 2) * pinch, ((a[1] + b[1]) / 2) * pinch];
  return [outer[0], mid(outer[0], outer[1]), outer[1], mid(outer[1], outer[2]), outer[2], mid(outer[2], outer[0])];
}
const closed = (points, x = 0, y = 0) => [...points.map(([px, py], i) => [i ? "L" : "M", x + px, y + py]), ["Z"]];

/** A circle of cubic segments, centred on the frame, starting at the top and running clockwise. */
function circle(r) {
  const k = 0.5523 * r;
  return [["M", 0, -r], ["C", k, -r, r, -k, r, 0], ["C", r, k, k, r, 0, r], ["C", -k, r, -r, k, -r, 0], ["C", -r, -k, -k, -r, 0, -r]];
}

/**
 * A white beam enters the prism's left face and leaves its right face as six
 * spectrum rays. The rays draw on from `f0`; `chase` seconds later their
 * tails follow, so the light travels out of frame.
 */
function prismBeams(s, { x = 0, y = 0, r = 150, f0 = 0, reach = 1000, chase = null, sw = 1 }) {
  const enter = [x - 0.433 * r, y - 0.25 * r], exit = [x + 0.433 * r, y - 0.25 * r];
  const beam = s.path([["M", x - reach, y + 0.6 * r], ["L", ...enter]], { name: "beam", stroke: TEXT, sw: 6 * sw, effects: [glow("#ffffff", 20, 1.2)] });
  beam.enter({ from: { trimEnd: 0 }, at: f0, dur: 0.33, ease: "in" });
  SPECTRUM.forEach((color, i) => {
    const spread = (i - (SPECTRUM.length - 1) / 2) * 0.22 * reach;
    const ray = s.path([["M", ...exit], ["L", x + reach, y + spread]], { name: `ray-${i}`, stroke: color, sw: 10 * sw, effects: [glow(color, 28, 1.1)] });
    ray.enter({ from: { trimEnd: 0 }, at: f0 + f(9 + i), dur: 0.4, ease: "outExpo" });
    if (chase !== null) ray.enter({ from: { trimStart: 1 }, at: f0 + chase + f(i), dur: f(14), ease: "in" });
  });
}

// ---------------------------------------------------------------------------
// S1 Split (2.0s): a beam hits a prism and fans out into the spectrum.

const s1 = v.scene("S1", 2.0, (s) => {
  s.rect(W, H, INK, { name: "ink" });
  const grid = s.rect(W, H, INK, { name: "grid", opacity: 0.35, effects: [{ id: "gp", type: "generator", enabled: true, mode: "gridPattern", amount: 1, scale: 24, colorA: INK, colorB: "#241d38" }] });
  grid.preset("kenBurns", { role: "loop", at: 0, dur: 2.0, zoom: 0.06, direction: "in", driftX: 0, driftY: 0 });

  prismBeams(s, { r: 150, f0: f(2), chase: f(30) });
  const prism = s.path(closed(prismPoints(150)), { name: "prism", stroke: TEXT, sw: 5, fill: "rgba(255,255,255,0.06)", effects: [glow("#e9e4ff", 30, 1)] });
  prism.preset("pop", { at: 0, dur: f(10), overshoot: 1.2 });

  // Sparks where the rays leave the frame, spinning in one after another.
  [[620, -320, 70], [760, -120, 44], [560, 90, 56], [820, 250, 38], [640, 360, 50]].forEach(([x, y, size], i) => {
    const at = f(20 + i * 2);
    const spark = s.rect(size, size, SPECTRUM[i + 1], { name: `spark-${i}`, kind: "star", x, y, shape: { sides: 4, innerRadius: 0.22 }, effects: [glow(SPECTRUM[i + 1], 18, 1.2)] });
    spark.preset("spin", { at, dur: f(10), turns: 0.5 });
  });

  s.kicker("LIGHT, SPLIT.", { x: 0, y: 420, at: f(24), dur: f(10), font: "mono", anchor: "center" });

  // White-out into the first word.
  s.flash({ at: f(52), dur: f(8), peak: 1, color: TEXT });
});

// ---------------------------------------------------------------------------
// S2 The words (2.5s, four beats plus a two-beat flourish): one word per
// beat, each on its own ground, hard cuts. Every cut below lands on a beat
// by construction — `at`/`dur` are `beat(n)` seconds, not a snap pass.

const s2 = v.scene("S2", beat(5), (s) => {
  function word(name, beatIndex, beats, ground) {
    const at = beat(beatIndex), dur = beat(beats);
    const g = s.group({ name: `word-${name}`, at, dur });
    const bg = typeof ground === "string"
      ? s.rect(W, H, ground, { parent: g.id, at, dur })
      : s.rect(W, H, INK, { parent: g.id, at, dur, effects: [ground] });
    return { g, bg, o: { parent: g.id, at, dur } };
  }

  // RUN: pops in past full size, then shakes.
  const run = word("run", 0, 1, LIME);
  const r = s.text("RUN", { ...run.o, name: "run", size: 560, weight: 900, color: INK, y: 20, tracking: -0.03, italic: true });
  r.preset("pop", { at: 0, dur: f(6), overshoot: 1.25 });
  r.preset("shake", { role: "emphasis", at: f(5), dur: f(10), intensity: 0.012, frequency: 16, seed: 3 });

  // IN: an outline word repeated over a grid, each copy a step later and a
  // step round the hue wheel.
  const inW = word("in", 1, 1, MAGENTA);
  const i = s.text("IN", {
    ...inW.o, name: "in", size: 300, weight: 900, color: CLEAR, x: -800, y: -340, mw: 0.3, italic: true,
    style: { stroke: { color: LIME, widthPx: 7 } },
    repeater: { count: 15, columns: 5, positionStep: { x: 400, y: 0 }, rowStep: { x: 0, y: 340 }, timeStepMs: 12, colorStep: { hueDegrees: 24 } }
  });
  i.enter({ from: { scale: 0.3, opacity: 0 }, at: 0, dur: f(6), ease: "outExpo" });

  // EVERY: the letters rise one after another, each cycling through the spectrum.
  const every = word("every", 2, 1, INK);
  const e = s.text("EVERY", { ...every.o, name: "every", size: 400, weight: 900, color: TEXT, y: 10, tracking: -0.02, italic: true });
  e.enter({ from: { offsetY: 90, opacity: 0 }, at: 0, dur: f(10), ease: "outExpo", by: "character", staggerMs: 30 });
  e.tween("glyph.color", [[0, LIME], [0.25, MAGENTA], [0.5, CYAN], [0.75, SPECTRUM[2]], [1, TEXT]], { at: 0, dur: f(10) });

  // COLOUR.: over a conic gradient that turns while its hue cycles, held two
  // beats to let the reveal breathe.
  const colour = word("colour", 3, 2, { id: "cg", type: "generator", enabled: true, mode: "conicGradient", amount: 1, angle: 0, colorA: MAGENTA, colorB: CYAN });
  colour.bg.name = "colour-bg";
  colour.bg.tween("effect.cg.angle", [[0, 0], [1, 300]], { at: 0, dur: beat(2) });
  colour.bg.preset("hueShift", { role: "loop", at: 0, dur: beat(1), direction: "forward" });
  const c = s.text("COLOUR.", { ...colour.o, name: "colour", size: 330, weight: 900, color: TEXT, y: 10, tracking: -0.02, italic: true, style: { stroke: { color: INK, widthPx: 12 } }, effects: [{ id: "cs", type: "stylize", enabled: true, mode: "rgbSplit", amount: 34, animate: false }] });
  c.enter({ from: { scale: 1.5, blur: 24, opacity: 0 }, at: 0, dur: f(10), ease: "outExpo" });
  c.tween("effect.cs.amount", [[0, 34], [1, 0]], { at: 0, dur: f(10) });
});

// ---------------------------------------------------------------------------
// S3 The reveal (4.5s): the keyed shoe flies onto a mesh gradient, ringed
// by type that orbits it.

const s3 = v.scene("S3", 4.5, (s) => {
  s.rect(W, H, INK, { name: "mesh", effects: [{ id: "mg", type: "generator", enabled: true, mode: "meshGradient", amount: 1, scale: 5, animate: true, colorA: "#12002e", colorB: VIOLET }] });
  s.rect(W, H, INK, { name: "fractal", blendMode: "screen", opacity: 0.4, effects: [{ id: "fr", type: "generator", enabled: true, mode: "fractal", amount: 1, scale: 3, animate: true, seed: 7, colorA: "#000000", colorB: MAGENTA }] });

  // Three rows of outline "PRISM", scrolling left one copy per loop.
  const marquee = s.text("PRISM", {
    name: "marquee", size: 300, weight: 900, color: CLEAR, x: -1575, y: -340, mw: 0.6, italic: true,
    style: { stroke: { color: "rgba(255,255,255,0.22)", widthPx: 3 } },
    repeater: { count: 12, columns: 4, positionStep: { x: 1050, y: 0 }, rowStep: { x: 525, y: 340 }, timeStepMs: 0 }
  });
  marquee.loop({ offsetX: [0, -1050] }, f(75), { ease: "linear" });

  // The ring of type: a circle path, tilted back in 3D, turning slowly.
  const ring = "PRISM RUNNER  •  RUN IN EVERY COLOUR  •  PRISM RUNNER  •  RUN IN EVERY COLOUR  •  ";
  const tilt = s.group({ name: "orbit-tilt", at: f(30), tx: { rotationX: 66, perspective: 1600 } });
  const orbit = s.text(ring, { name: "orbit-type", parent: tilt.id, at: f(30), size: 40, weight: 700, color: TEXT, tracking: 0.25, path: circle(470) });
  orbit.preset("rotate", { role: "loop", at: 0, dur: f(360), direction: "ccw" });
  orbit.enter({ from: { opacity: 0 }, at: 0, dur: f(16), ease: "out" });

  // The shoe: keyed, rimmed in cyan, whipped in with a 3D swing, then
  // floating. The wiggle and the float run on the shoe, the entrance on its
  // rig, so they compose. The glow's follow-link names the shoe's own fixed
  // id — set below — since a link can only name a clip that already exists.
  const glowUnder = s.ellipse(1000, { type: "radial", stops: [{ offset: 0, color: "rgba(255,43,214,0.75)" }, { offset: 0.35, color: "rgba(34,225,255,0.25)" }, { offset: 0.7071, color: "rgba(34,225,255,0)" }] },
    { name: "floor-glow", at: f(20), tx: { scale: { x: 1.2, y: 0.22 } }, animationLinks: [{ target: "positionY", sourceClipId: "shoe", source: "positionY", offset: 360 }] });
  glowUnder.enter({ from: { opacity: 0 }, at: 0, dur: f(14), ease: "out" });
  const rig = s.group({ name: "shoe-rig", tx: { perspective: 1600 } });
  rig.enter({ from: { offsetX: 1500, rotationY: -70, rotation: -14 }, at: f(4), dur: f(24), ease: "outExpo" });
  const shoe = image(s, "shoe", {
    name: "shoe", id: "shoe", parent: rig.id, y: -30, s: 0.95, mask: ABOVE_FLOOR(0.79),
    motionBlur: { samplesPerFrame: 8, shutterAngle: 270 },
    animationLinks: [{ target: "rotation", kind: "wiggle", amplitude: 0.025, frequencyHz: 0.7, seed: 5 }],
    effects: [KEY("key"), { id: "eh", type: "stylize", enabled: true, mode: "edgeHighlight", amount: 1.4, scale: 5, color: CYAN }]
  });
  shoe.preset("float", { role: "loop", at: 0, dur: f(90), amplitude: 0.014, frequency: 0.6, seed: 2 });

  // An anamorphic flare across the whole picture as the shoe lands.
  const flare = s.adjust([{ id: "lf", type: "stylize", enabled: true, mode: "lensFlare", amount: 0, scale: 2.5, angle: 0, color: "#bfefff" }], { name: "flare" });
  flare.tween("effect.lf.amount", [[0, 0], [0.19, 0], [0.25, 1.8, "out"], [0.6, 0.5, "out"], [1, 0.4]], { at: 0, dur: 4.5 });

  const intro = s.text("INTRODUCING", { name: "intro", anchor: "left", mw: 0.4, at: f(45), dur: f(90), size: 28, weight: 600, color: LIME, font: "mono", tracking: 12 / 28 });
  intro.scramble({ at: 0, dur: f(14), seed: 3 });
  const title = s.text("PRISM RUNNER", { name: "title", anchor: "left", mw: 0.6, at: f(50), dur: f(85), size: 96, weight: 900, color: TEXT, tracking: 0.06, italic: true });
  title.enter({ from: { opacity: 0 }, at: 0, dur: f(20), ease: "out", by: "character", staggerMs: 25 });
  title.tween("glyph.blurPx", [[0, 24], [1, 0]], { at: 0, dur: f(20) });
  title.tween("glyph.trackingPx", [[0, 40], [1, 0]], { at: 0, dur: f(20) });
  s.stack([title, intro], { at: { x: -700, y: 370 }, anchor: "left", gap: 40, align: "start" });
});

// ---------------------------------------------------------------------------
// S4 The specs (4.5s, three cards of 1.5s each — every cut on a beat): one
// detail per card.

function specLabel(s, str, o = {}) {
  return s.text(str, { size: 28, weight: 500, color: INK, font: "mono", anchor: "left", mw: 0.4, tracking: 4 / 28, ...o });
}

const s4 = v.scene("S4", beat(9), (s) => {
  // A: the knit, depixelating into focus under a slow turbulence.
  const a = s.group({ name: "card-a-scene", at: beat(0), dur: beat(3) });
  const ao = { parent: a.id, at: beat(0), dur: beat(3) };
  const knit = image(s, "knit", {
    ...ao, name: "knit", effects: [
      { id: "px", type: "pixelate", enabled: true, cellSize: 1 },
      { id: "tb", type: "stylize", enabled: true, mode: "turbulence", amount: 0.4, scale: 3, animate: true, seed: 4 }
    ]
  });
  knit.tween("effect.px.cellSize", [[0, 120], [0.35, 1, "out"], [1, 1]], { at: 0, dur: f(44) });
  knit.preset("kenBurns", { role: "loop", at: 0, dur: f(44), zoom: 0.1, direction: "in", driftX: 0.02, driftY: 0 });
  const cardA = s.group({ ...ao, name: "card-a", x: -500, y: 250 });
  s.rect(700, 300, TEXT, { ...ao, parent: cardA.id, name: "card-a-panel", r: 40, effects: [
    { id: "is", type: "stylize", enabled: true, mode: "innerShadow", amount: 1, scale: 10, angle: 90, color: "#cfc8e6" },
    { id: "ds", type: "dropShadow", enabled: true, offsetX: 0, offsetY: 30, blur: 60, color: "rgba(0,0,0,0.5)" }
  ] });
  const labelA = specLabel(s, "HOLO-KNIT UPPER", { ...ao, parent: cardA.id });
  const weight = s.text("198 G", { ...ao, parent: cardA.id, name: "weight", anchor: "left", mw: 0.4, size: 170, weight: 900, color: INK, italic: true });
  weight.count({ from: 0, to: 198, at: f(10), dur: f(18), suffix: " G", ease: "out" });
  s.stack([labelA, weight], { parent: cardA.id, at: { x: -310, y: -20 }, anchor: "left", gap: 24, align: "start" });
  cardA.preset("pop", { at: f(6), dur: f(10), overshoot: 1.08 });

  // B: the sole over a cascading hex lattice, energy counting up.
  const b = s.group({ name: "card-b", at: beat(3), dur: beat(3), transitionIn: { type: "push", durationMs: 130, direction: "up", easing: SNAP } });
  const bo = { parent: b.id, at: beat(3), dur: beat(3) };
  s.rect(W, H, INK, { ...bo, name: "card-b-ink" });
  const hex = s.rect(180, 180, null, {
    ...bo, name: "hex", kind: "polygon", x: -1010, y: -520, stroke: MAGENTA, sw: 5, opacity: 0.85, shape: { sides: 6 },
    repeater: { count: 96, columns: 16, positionStep: { x: 156, y: 0 }, rowStep: { x: -78, y: 135 }, timeStepMs: 10, colorStep: { hueDegrees: 4 } }
  });
  hex.enter({ from: { scale: 0 }, at: 0, dur: f(10), ease: "spring(260,14,1)" });
  const sole = image(s, "sole", { ...bo, name: "sole", x: 360, s: 0.85, tx: { perspective: 1400 }, effects: [KEY("sole-key"), glow(CYAN, 30, 0.35)] });
  sole.enter({ from: { rotationX: 55, offsetY: 220, opacity: 0 }, at: 0, dur: f(16), ease: "outExpo" });
  sole.loop({ rotation: [-6, 3] }, beat(3), { ease: "linear" });
  const labelB = specLabel(s, "ENERGY RETURN", { ...bo, name: "label-b", color: LIME });
  labelB.scramble({ at: f(4), dur: f(12), seed: 8 });
  const energy = s.text("87%", {
    ...bo, name: "energy", anchor: "left", mw: 0.4, size: 280, weight: 900, color: TEXT, italic: true,
    effects: [{ id: "ig", type: "stylize", enabled: true, mode: "innerGlow", amount: 1.2, scale: 9, color: MAGENTA }]
  });
  energy.count({ from: 0, to: 87, at: f(2), dur: f(20), suffix: "%", ease: "out" });
  const foam = specLabel(s, "PRISM FOAM MIDSOLE", { ...bo, name: "foam", color: DIM, tracking: 0.12 });
  s.stack([labelB, energy, foam], { parent: b.id, at: { x: -860, y: -170 }, anchor: "left", gap: 34, align: "start" });

  // C: four colourways in a grid, a quarter turn of hue apart.
  const cc = s.group({ name: "card-c", at: beat(6), dur: beat(3), transitionIn: { type: "slide", durationMs: 130, direction: "left", easing: SNAP } });
  const co = { parent: cc.id, at: beat(6), dur: beat(3) };
  s.rect(W, H, INK, { ...co, name: "card-c-ink" });
  s.rect(W, H, INK, { ...co, name: "card-c-noise", opacity: 0.5, effects: [{ id: "nz", type: "generator", enabled: true, mode: "noise", amount: 0.35, scale: 3, animate: true, seed: 11, colorA: INK, colorB: "#4a4366" }] });
  const way = image(s, "shoe", {
    ...co, name: "colourway", x: -440, y: -240, s: 0.46, mask: ABOVE_FLOOR(0.79),
    effects: [{ id: "pz", type: "posterize", enabled: true, levels: 6 }, KEY("way-key")],
    repeater: { count: 4, columns: 2, positionStep: { x: 880, y: 0 }, rowStep: { x: 0, y: 470 }, timeStepMs: 70, colorStep: { hueDegrees: 90 } }
  });
  way.enter({ from: { scale: 0.4, opacity: 0 }, at: 0, dur: f(12), ease: "spring(220,15,1)" });
  const ways = s.pill("4 COLOURWAYS", { ...co, name: "ways", fillColor: LIME, color: INK, stroke: "rgba(0,0,0,0)", padX: 32, size: 42, weight: 700, font: "display" });
  ways.preset("pop", { at: f(8), dur: f(10), overshoot: 1.15 });
});

// ---------------------------------------------------------------------------
// S5 The leap (3.0s): the sprinter crosses a neon grid, trailing the spectrum.

const s5 = v.scene("S5", 3.0, (s) => {
  s.rect(W, H, { type: "linear", angle: 90, stops: [{ offset: 0, color: INK }, { offset: 0.55, color: "#2b0a4f" }, { offset: 1, color: MAGENTA }] }, { name: "sky" });
  const sun = s.ellipse(620, { type: "linear", angle: 90, stops: [{ offset: 0, color: LIME }, { offset: 1, color: MAGENTA }] }, { name: "sun", y: -40, effects: [glow(MAGENTA, 60, 0.9)] });
  sun.enter({ from: { offsetY: 120 }, at: 0, dur: f(20), ease: "outExpo" });
  s.rect(W, H, INK, {
    name: "floor", y: 420, tx: { scale: { x: 3, y: 1 }, rotationX: 72, perspective: 700 },
    effects: [{ id: "fg", type: "generator", enabled: true, mode: "gridPattern", amount: 1, scale: 22, colorA: "#0d0420", colorB: CYAN }, glow(CYAN, 12, 0.6)]
  });

  // Streaks racing right to left, their heads and tails both moving.
  const streak = s.path([["M", 980, 0], ["L", -980, 0]], {
    name: "streak", stroke: CYAN, sw: 4, y: -330, opacity: 0.8,
    repeater: { count: 6, columns: 1, positionStep: { x: 0, y: 0 }, rowStep: { x: 0, y: 95 }, timeStepMs: 90, colorStep: { hueDegrees: 55 } }
  });
  streak.loop({ trimEnd: [[0, 0], [0.5, 1, "in"], [1, 1]], trimStart: [[0, 0], [0.5, 0], [1, 1, "out"]] }, f(16), { ease: "linear" });

  // The sprinter: one keyed copy on top, and under it a trail of delayed
  // copies, each a step round the hue wheel.
  const motion = {
    offsetX: [[0, -1500], [0.4, -160, "outExpo"], [0.6, 160, "linear"], [1, 1700, "in"]],
    offsetY: [[0, 260], [0.5, 170, "out"], [1, 260, "in"]]
  };
  const trail = image(s, "athlete", { name: "trail", opacity: 0.75, mask: ABOVE_FLOOR(0.855), effects: [KEY("trail-key")], repeater: { count: 6, columns: 6, positionStep: { x: 0, y: 0 }, timeStepMs: 80, colorStep: { hueDegrees: 55 } } });
  trail.animate(motion, { at: 0, dur: 3.0, ease: "linear" });
  const athlete = image(s, "athlete", { name: "athlete", mask: ABOVE_FLOOR(0.855), effects: [KEY("athlete-key"), { id: "ah", type: "stylize", enabled: true, mode: "edgeHighlight", amount: 1, scale: 4, color: LIME }] });
  athlete.animate(motion, { at: 0, dur: 3.0, ease: "linear" });

  // Two lines, stepped at 12 fps like stop motion.
  [["LIGHT BENDS.", 0, 1.5], ["SO DO RECORDS.", 1.5, 1.5]].forEach(([str, at, dur], i) => {
    const line = s.text(str, { name: `line-${i}`, at, dur, y: -380, size: 170, weight: 900, color: TEXT, tracking: -0.01, italic: true, steppedTime: { fps: 12 }, ...(i === 1 && { fill: RAINBOW }) });
    line.enter({ from: { offsetY: 70, opacity: 0 }, at: 0, dur: f(12), ease: "outExpo", by: "word", staggerMs: 130 });
  });
});

// ---------------------------------------------------------------------------
// S6 The end card (3.0s): the prism becomes a star, pulsing on the beat.

const s6 = v.scene("S6", 3.0, (s) => {
  s.rect(W, H, INK, { name: "ink" });
  s.ellipse(1400, { type: "radial", stops: [{ offset: 0, color: "rgba(123,61,255,0.45)" }, { offset: 0.7071, color: "rgba(123,61,255,0)" }] }, { name: "halo", y: -200 });

  const LX = 0, LY = -250, LR = 90;
  prismBeams(s, { x: LX, y: LY, r: LR, f0: f(4), reach: 760, sw: 0.6 });
  const logo = s.path(closed(prismPoints(LR), LX, LY), { name: "logo", stroke: TEXT, sw: 5, fill: "rgba(255,255,255,0.08)", effects: [glow("#e9e4ff", 30, 1.1)] });
  // el.morph() resamples the logo's own points toward the star's and holds
  // each side outside its own window (0..0.2 tri, 0.32..1 star), the same
  // three-phase shape the hand-tweened `shape.d` string pair used to spell out.
  logo.morph(closed(prismPoints(LR, 0.3), LX, LY), { at: 0.6, dur: 0.36, ease: "outExpo" });
  // One pulse on each beat from the one after the morph lands to the end.
  for (let b = 3; b <= 5; b++) logo.preset("pulse", { role: "emphasis", at: beat(b), dur: 0.3, intensity: 0.1 });

  const wordmark = s.text("PRISM", { name: "wordmark", size: 300, weight: 900, color: TEXT, tracking: -0.02, italic: true, style: { fill: RAINBOW } });
  wordmark.enter({ from: { scale: 1.5, blur: 24, opacity: 0 }, at: f(12), dur: f(8), ease: "outExpo" });
  wordmark.tween("text.fill.angle", [[0, 0], [1, 120]], { at: f(12), dur: f(50) });
  const tagline = s.text("RUN IN EVERY COLOUR.", { name: "tagline", size: 42, weight: 600, color: TEXT, tracking: 0.28 });
  tagline.enter({ from: { opacity: 0 }, at: f(24), dur: f(16), ease: "out", by: "character", staggerMs: 18 });
  tagline.tween("glyph.trackingPx", [[0, 30], [1, 0]], { at: f(24), dur: f(16) });
  const cta = s.pill("PRE-ORDER NOW  ·  10.03", { name: "cta", fillColor: LIME, color: INK, stroke: "rgba(0,0,0,0)", padX: 30, size: 44, weight: 800, font: "display" });
  cta.enter({ from: { offsetY: 40, opacity: 0 }, at: f(36), dur: f(14), ease: "spring(180,18,1)" });
  s.stack([wordmark, tagline, cta], { gap: 70, align: "center" });

  s.adjust([{ id: "ll", type: "stylize", enabled: true, mode: "lightLeakOverlay", amount: 0.5, scale: 1.4, animate: true, seed: 3, color: MAGENTA }], { name: "leak" });
});

// ---------------------------------------------------------------------------
// Assembly
//
// A hard cut S1 -> S2, then an iris, a gradient wipe, a zoom blur and a dip
// to white carry S3, S4, S5 and S6 into each other, each overlapping its
// predecessor by its own duration — the same cut points the reference cut.

v.series([
  s1,
  s2,
  v.transition("iris", 0.2, { softness: 0.08, easing: "easeIn" }),
  s3,
  v.transition("gradientWipe", 0.3, { direction: "right", map: "noise", scale: 4, seed: 9, softness: 0.2, easing: EASE_IO }),
  s4,
  v.transition("zoomBlur", 0.2, { blur: 1, easing: "easeIn" }),
  s5,
  v.transition("dipToColor", 0.33, { color: "#ffffff", easing: "easeInOut" }),
  s6
]);

// The scene-finishing saturation, vignette and grain, across the whole video.
v.adjust(
  [
    { id: "sat", type: "color", enabled: true, saturation: 1.1, contrast: 1.05 },
    { id: "vig", type: "vignette", enabled: true, amount: 0.18, softness: 0.8 },
    { id: "grain", type: "grain", enabled: true, amount: 0.04, animate: true, seed: 5 }
  ],
  { id: "finish", name: "saturation + vignette + grain", trackId: "t_finish" }
);

const saved = await v.save(nodetool.timelines, {
  name: "Prism — Run in Every Colour",
  showcase: true,
  ops: v.beats({ bpm: BPM })
});
await output("timeline", {
  name: "Prism — Run in Every Colour",
  description: "An 18-second running-shoe launch ad on a 120 BPM grid: green-screen stills keyed in the timeline, generated grounds, a prism that splits light, orbiting type, spectrum trails and a beat-pulsing end card.",
  fps: FPS,
  width: W,
  height: H,
  durationMs: Math.round(v.durationMs),
  videoUri: "package://nodetool-base/timelines/prism/ad.mp4",
  posterUri: "package://nodetool-base/timelines/prism/poster.jpg",
  ...saved
});
