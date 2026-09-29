// Tidewater: a 16-second 4:5 poster for a fictional summer jazz weekend, made
// to look like a three-ink risograph print that moves.
//
// `python3 scripts/example-timelines/tidewater-score.py` writes the score.
// `node scripts/example-timelines/build.mjs tidewater` writes the shipped bundle
// packages/base-nodes/nodetool/examples/timelines/tidewater.timeline.json.
// `node scripts/render-example-timeline.mjs tidewater` renders its video and poster.
//
// The print look comes from three rules. Every ink layer multiplies onto the
// paper, so pink over blue prints purple. Headlines print twice with the pink
// pass out of register. Every animated clip samples its clock at 12 fps, so
// the motion steps on twos like cut paper under a camera. Frames are at
// 24 fps against a 120 BPM score: a beat is 12 frames and a bar is 48.
//
// Every time value below is seconds, local to the scene that authored it —
// `v.series()` is the only place a scene's position in the whole video is
// decided. Positions are px from the frame centre.
import { video, rad } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1350, FPS = 24, BEAT = 12, BAR = 48;
const f = (frames) => frames / FPS; // a frame count from the original cut, as seconds
const msFor = (frames) => Math.round((frames / FPS) * 1000);

const PAPER = "#f3ecdc", PINK = "#ec3a94", BLUE = "#0078bf", YELLOW = "#ffe800";
// A dark navy for ink printed directly on the pink stock: BLUE itself only
// reaches 1.26:1 nominal contrast against PINK (the multiply blend darkens
// the actual render, but the legibility check reads the two flat colours).
// This reads 4.8:1 nominal, so it clears the check under either blend mode,
// and multiplies down to a near-black ~5.4:1 in the render.
const INK_ON_PINK = "#06172c";
const DISPLAY = "Bebas Neue", SERIF = "Playfair Display", MONO = "JetBrains Mono";
const MUL = "multiply";

let _uid = 0;
const uid = (p) => `${p}${++_uid}`;

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: PAPER, ink2: PAPER, text: BLUE, dim: BLUE, accent: PINK },
  fonts: { display: DISPLAY, serif: SERIF, mono: MONO }
});

const uri = (name) => `package://nodetool-base/timelines/tidewater/${name}`;

// ---------------------------------------------------------------------------
// Print helpers

/**
 * A 2×2×2 LUT that turns grey into one ink: black prints the full ink, white
 * prints nothing. After a halftone it makes the dots that colour.
 */
function inkLut(hex) {
  const ink = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const rows = [];
  for (const b of [0, 1]) for (const g of [0, 1]) for (const r of [0, 1]) {
    const m = (r + g + b) / 3;
    rows.push(ink.map((c) => (c * (1 - m) + m).toFixed(4)).join(" "));
  }
  return `LUT_3D_SIZE 2\n${rows.join("\n")}`;
}

/** A halftone screen in one ink. The fill's grey sets the dot size. */
const screen = (hex, cell = 14) => [
  { id: uid("ht"), type: "stylize", enabled: true, mode: "halftone", amount: 1, scale: cell },
  { id: uid("lut"), type: "lut", enabled: true, cube: inkLut(hex), intensity: 1 }
];

/** Hand-cut paper never sits still: a small stepped rotation wobble. */
const boil = (seed, amp = 0.012) => [{ target: "rotation", kind: "wiggle", amplitude: amp, frequencyHz: 6, seed }];

/**
 * A headline printed in two passes: blue in register, pink `off` px out of
 * it. Both copies share the same reveal, so the misprint travels with the
 * type. Returns the group and both passes.
 */
function misprint(s, str, size, o = {}) {
  const g = s.group({ name: o.name ?? "misprint", parent: o.parent, x: o.x ?? 0, y: o.y ?? 0 });
  const [dx, dy] = o.off ?? [9, 6];
  const common = { font: o.font ?? DISPLAY, weight: o.weight ?? 400, mw: o.mw ?? 0.95, anchor: o.anchor, tracking: o.tracking, blendMode: MUL, parent: g.id, size };
  const pink = s.text(str, { ...common, color: o.under ?? PINK, name: "pink pass", x: dx, y: dy, animationLinks: boil(o.seed ?? 1, 0.006) });
  const blue = s.text(str, { ...common, color: o.over ?? BLUE, name: "blue pass", animationLinks: boil((o.seed ?? 1) + 50, 0.006) });
  return { g, pink, blue };
}

/** A stamp: overshoot scale and land. `opts` can stagger it by character or word. */
function stamp(clip, atSec, opts = {}) {
  return clip.animate({ scale: [1.5, 1, "easeOutBack"], opacity: [0, 1, "hold"] }, { at: atSec, dur: f(4), ...opts });
}

/** Drop into place from above with a slight turn, the way a card lands on a table. */
function drop(clip, atSec, turn = 4) {
  return clip.animate({ offsetY: [-260, 0, "easeOutBack"], rotation: [rad(turn * 3), 0, "easeOutBack"], opacity: [0, 1, "hold"] }, { at: atSec, dur: f(8) });
}

/**
 * A left-wipe reveal: `typewriter` for a line of type. Matches the reveal
 * `s.kicker()`'s craft helper uses internally.
 */
function typewriter(clip, atSec, durSec) {
  clip.animate({ wipeProgress: [0, 1], opacity: [0, 1] }, { at: atSec, dur: durSec, ease: "outExpo" });
  clip.animations.at(-1).custom.mask = { direction: "left", softness: 0.05 };
  return clip;
}

/** The paper stock: a warm sheet, mottled by a multiplied fractal field. */
function paper(s, seed) {
  s.rect(W, H, PAPER, { name: "paper" });
  s.rect(W, H, "#ffffff", {
    name: "paper fibre", blendMode: MUL, opacity: 0.22,
    effects: [{ id: uid("pf"), type: "generator", enabled: true, mode: "fractal", colorA: "#cdbf9f", colorB: "#ffffff", scale: 5, seed }]
  });
}

/** Registration crosshairs in the four corners, printed in each ink. */
function registration(s) {
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * (W / 2 - 46), y = sy * (H / 2 - 46);
    for (const [ink, d] of [[BLUE, 0], [PINK, 2]]) {
      s.path([["M", x - 20 + d, y + d], ["L", x + 20 + d, y + d], ["M", x + d, y - 20 + d], ["L", x + d, y + 20 + d]], { name: "reg mark", stroke: ink, sw: 2, blendMode: MUL });
      s.ellipse(22, null, { name: "reg ring", x: x + d, y: y + d, stroke: ink, sw: 2, blendMode: MUL });
    }
  }
}

/** Mono slug line along the bottom edge, the job ticket every proof carries. */
function slug(s, label) {
  s.text(label, { size: 18, weight: 500, color: BLUE, name: "slug", font: MONO, anchor: "left", mw: 0.8, x: -W / 2 + 90, y: H / 2 - 46, blendMode: MUL, tracking: 2 / 18 });
  [PINK, BLUE, YELLOW].forEach((ink, i) => s.rect(26, 26, ink, { name: "ink patch", x: W / 2 - 170 + i * 32, y: H / 2 - 46, blendMode: MUL }));
}

/**
 * A wave band: a filled strip of crests that swap with troughs on a loop, a
 * standing wave that steps on twos. The crests stay inside the frame because a
 * shape is drawn in the frame raster, so a scrolled band shows its cut end.
 */
function wave(s, y, amp, len, flip, ink, o = {}) {
  const X = (val) => ((W / 2 + val) / W).toFixed(5), Y = (val) => ((H / 2 + val) / H).toFixed(5);
  const pathData = (points) => points.map(([cmd, ...xy]) => cmd + xy.map((val, i) => (i % 2 ? Y(val) : X(val))).join(" ")).join(" ");
  const outline = (sign) => {
    const pts = [["M", -W / 2, y]];
    for (let k = 0, x = -W / 2; x < W / 2; k++, x += len / 2) {
      pts.push(["Q", x + len / 4, y + (k % 2 ? amp : -amp) * sign, Math.min(W / 2, x + len / 2), y]);
    }
    pts.push(["L", W / 2, H / 2], ["L", -W / 2, H / 2], ["Z"]);
    return pathData(pts);
  };
  const [a, b] = [outline(flip ? -1 : 1), outline(flip ? 1 : -1)];
  const band = s.path([["M", 0, 0]], { name: o.name ?? "wave", fill: ink, blendMode: MUL, opacity: o.opacity ?? 1, parent: o.parent });
  band.shapeStyle.d = a;
  const cycleSec = f(o.cycle ?? 48);
  band.loop({ offsetY: [[0, 0], [0.5, o.bob ?? 10, "easeInOut"], [1, 0, "easeInOut"]] }, cycleSec, { ease: "linear" });
  band.animations.at(-1).styleTracks = [{ target: "shape.d", keyframes: [{ t: 0, value: a }, { t: 0.5, value: b, easing: "easeInOut" }, { t: 1, value: a, easing: "easeInOut" }] }];
  return band;
}

// ---------------------------------------------------------------------------
// S1 The stamp (101 frames): the name is stamped letter by letter on the beat.

const s1 = v.scene("S1", f(101), (s) => {
  paper(s, 3);
  const sun = s.ellipse(620, YELLOW, { name: "yellow disc", x: 150, y: -170, blendMode: MUL });
  sun.animate({ scale: [0.2, 1, "easeOutBack"] }, { at: 0, dur: f(10) });

  const kicker = s.text("PIER 9 PRESENTS", { size: 36, weight: 500, color: BLUE, name: "kicker", font: MONO, y: -470, blendMode: MUL, tracking: 10 / 36 });
  typewriter(kicker, f(2), f(10));

  // One letter a beat, then WATER on the eighths.
  const tide = misprint(s, "TIDE", 470, { name: "TIDE", y: -150, seed: 2 });
  for (const pass of [tide.pink, tide.blue]) stamp(pass, f(BEAT), { by: "character", staggerMs: msFor(BEAT) });
  const water = misprint(s, "WATER", 300, { name: "WATER", y: 180, seed: 7, under: YELLOW, off: [-8, 7] });
  for (const pass of [water.pink, water.blue]) stamp(pass, f(5 * BEAT), { by: "character", staggerMs: msFor(BEAT / 2) });

  const rule = s.rect(760, 10, PINK, { name: "rule", y: 350, blendMode: MUL });
  rule.animate({ scaleX: [0, 1, "easeOutExpo"] }, { at: f(7 * BEAT), dur: f(6) });
  const sub = s.text("SUMMER JAZZ ON THE WATER", { size: 34, weight: 600, color: BLUE, name: "sub", font: MONO, y: 410, blendMode: MUL, tracking: 6 / 34 });
  typewriter(sub, f(7 * BEAT + 2), f(12));

  registration(s);
  slug(s, "TIDEWATER / PROOF 1 OF 4 / PINK + BLUE + YELLOW");
});

// ---------------------------------------------------------------------------
// S2 Sunset (101 frames): a halftone sun sinks toward the pier.

const s2 = v.scene("S2", f(101), (s) => {
  paper(s, 5);

  const sun = s.ellipse(560, { type: "radial", stops: [{ offset: 0, color: "#2a2a2a" }, { offset: 0.7071, color: "#c8c8c8" }] }, {
    name: "halftone sun", y: -60, blendMode: MUL, effects: screen(PINK, 16)
  });
  sun.animate({ offsetY: [-260, 120, "linear"] }, { at: 0, dur: f(2 * BAR) });
  const halo = s.ellipse(620, null, { name: "sun halo", y: -60, stroke: PINK, sw: 4, blendMode: MUL, shape: { dash: [18, 16] } });
  halo.animate({ offsetY: [-260, 120, "linear"], rotation: [0, rad(40), "linear"] }, { at: 0, dur: f(2 * BAR) });

  // The pier: posts and a deck, printed in blue over the sea.
  const pier = s.group({ name: "pier", x: -140, y: 250 });
  pier.animate({ offsetX: [-500, 0, "easeOutExpo"] }, { at: 0, dur: f(10) });
  s.rect(620, 22, BLUE, { name: "deck", parent: pier.id, blendMode: MUL });
  for (let i = 0; i < 6; i++) s.rect(18, 150, BLUE, { name: "post", parent: pier.id, x: -280 + i * 112, y: 80, blendMode: MUL });
  s.rect(12, 120, BLUE, { name: "lamp post", parent: pier.id, x: 260, y: -70, blendMode: MUL });
  const lamp = s.ellipse(40, YELLOW, { name: "lamp", parent: pier.id, x: 260, y: -140, blendMode: MUL });
  lamp.loop({ scale: [[0, 1], [0.5, 1.35, "easeOut"], [1, 1, "easeIn"]] }, f(BEAT * 2), { ease: "linear" });

  wave(s, 360, 26, 220, false, BLUE, { name: "wave far", opacity: 0.55, cycle: 72, bob: 8 });
  wave(s, 430, 30, 260, true, PINK, { name: "wave mid", opacity: 0.8, cycle: 56, bob: 12 });
  wave(s, 510, 34, 300, false, BLUE, { name: "wave near", cycle: 44, bob: 14 });

  // Gulls: two strokes each, bobbing across.
  [[-300, -420, 1], [-150, -360, 0.7], [240, -470, 0.85]].forEach(([x, y, sc], i) => {
    const gull = s.group({ name: `gull ${i}`, x, y, s: sc });
    gull.animate({ offsetX: [0, 220, "linear"] }, { at: 0, dur: f(2 * BAR) });
    const wing = s.path([["M", -34, 0], ["Q", -16, -22, 0, 0], ["Q", 16, -22, 34, 0]], { name: "gull wings", parent: gull.id, stroke: BLUE, sw: 5, blendMode: MUL });
    wing.loop({ scaleY: [[0, 1], [0.5, -0.6, "easeInOut"], [1, 1, "easeInOut"]] }, f(BEAT), { ease: "linear" });
  });

  const l1 = s.text("Three warm nights", { size: 92, weight: 700, color: BLUE, name: "line one", font: SERIF, y: -470, blendMode: MUL, tracking: -0.02, italic: true });
  l1.animate({ offsetY: [30, 0, "easeOutBack"], opacity: [0, 1, "hold"] }, { at: f(BEAT), dur: f(4), by: "word", staggerMs: msFor(BEAT) });
  const l2 = s.text("of jazz on the pier.", { size: 92, weight: 700, color: PINK, name: "line two", font: SERIF, y: -370, blendMode: MUL, tracking: -0.02, italic: true });
  l2.animate({ offsetY: [30, 0, "easeOutBack"], opacity: [0, 1, "hold"] }, { at: f(4 * BEAT), dur: f(4), by: "word", staggerMs: msFor(BEAT / 2) });

  registration(s);
  slug(s, "TIDEWATER / PROOF 2 OF 4 / SUNSET SCREEN 16 LPI");
});

// ---------------------------------------------------------------------------
// S3 The lineup (101 frames): three cut-paper cards land, one per beat pair.

const NIGHTS = [
  ["FRI", "14", "The Marlowe Trio", "piano · bass · brushes", YELLOW, -4],
  ["SAT", "15", "Ada Kline Quartet", "tenor sax after dark", PINK, 3],
  ["SUN", "16", "Brass & Salt", "a nine-piece send-off", BLUE, -2]
];

function card(s, [day, date, act, note, ink, turn], i) {
  const y = -330 + i * 290;
  const holder = s.group({ name: `night ${day}`, x: -40, y, tx: { rotation: rad(turn) } });
  drop(holder, f(6 + i * 2 * BEAT), turn);
  // The card itself boils; the holder carries the landing.
  const g = s.group({ name: "card", parent: holder.id, animationLinks: boil(10 + i) });
  s.rect(820, 240, "#fbf6ea", { name: "card stock", parent: g.id, effects: [{ id: uid("cs"), type: "dropShadow", enabled: true, offsetX: 8, offsetY: 10, blur: 0, color: "rgba(40,30,20,0.28)" }] });
  s.ellipse(180, ink, { name: "date disc", parent: g.id, x: -290, blendMode: MUL });
  s.text(date, { size: 120, weight: 400, color: ink === BLUE ? PINK : BLUE, name: "date", parent: g.id, font: DISPLAY, x: -290, y: 6, mw: 0.2, blendMode: MUL });
  s.text(day, { size: 34, weight: 600, color: BLUE, name: "day", parent: g.id, font: MONO, anchor: "left", x: -160, y: -72, mw: 0.5, blendMode: MUL, tracking: 8 / 34 });
  s.text(act, { size: 60, weight: 700, color: BLUE, name: "act", parent: g.id, font: SERIF, anchor: "left", x: -164, y: 0, mw: 0.6, blendMode: MUL, tracking: -0.02, italic: true });
  s.text(note, { size: 34, weight: 500, color: BLUE, name: "note", parent: g.id, font: MONO, anchor: "left", x: -160, y: 70, mw: 0.6, blendMode: MUL });
}

const s3 = v.scene("S3", f(101), (s) => {
  paper(s, 8);
  // A Bauhaus ground: a pink half circle and a yellow bar behind the cards.
  const half = s.path([["M", 540, -300], ["A", 420, 420, 0, 0, 0, 540, 540], ["Z"]], { name: "half circle", fill: PINK, blendMode: MUL, opacity: 0.85 });
  half.animate({ offsetX: [400, 0, "easeOutExpo"] }, { at: 0, dur: f(10) });
  const bar = s.rect(140, H, YELLOW, { name: "yellow bar", x: -420, blendMode: MUL });
  bar.animate({ scaleY: [0, 1, "easeOutExpo"] }, { at: 0, dur: f(10) });

  const head = misprint(s, "THE LINEUP", 150, { name: "lineup", y: -560, seed: 21, off: [7, 5] });
  for (const pass of [head.pink, head.blue]) stamp(pass, 0, { by: "character", staggerMs: msFor(1) });

  NIGHTS.forEach((night, i) => card(s, night, i));

  // A record turning on twos in the corner.
  const rec = s.group({ name: "record", x: 380, y: 520 });
  rec.animate({ offsetX: [300, 0, "easeOutExpo"] }, { at: 0, dur: f(10) });
  const disc = s.group({ name: "disc", parent: rec.id });
  s.ellipse(300, BLUE, { name: "vinyl", parent: disc.id, blendMode: MUL });
  for (const d of [250, 200, 150]) s.ellipse(d, null, { name: "groove", parent: disc.id, stroke: "#5fb0e0", sw: 2, blendMode: MUL });
  s.path([["M", 0, 0], ["L", 0, -150], ["A", 150, 150, 0, 0, 1, 106, -106], ["Z"]], { name: "sheen", parent: disc.id, fill: "rgba(255,255,255,0.35)" });
  s.ellipse(100, PINK, { name: "label", parent: disc.id, blendMode: MUL });
  s.ellipse(12, PAPER, { name: "spindle", parent: disc.id });
  disc.loop({ rotation: [[0, 0], [1, rad(360), "linear"]] }, f(BAR), { ease: "linear" });

  registration(s);
  slug(s, "TIDEWATER / PROOF 3 OF 4 / LINEUP");
});

// ---------------------------------------------------------------------------
// S4 The poster (95 frames): the full lockup, and the pink pass slides into register.

const s4 = v.scene("S4", f(95), (s) => {
  paper(s, 11);

  const disc = s.ellipse(760, YELLOW, { name: "yellow sun", y: -120, blendMode: MUL });
  disc.animate({ scale: [0.6, 1, "easeOutBack"] }, { at: 0, dur: f(12) });
  const screenSun = s.ellipse(520, { type: "radial", stops: [{ offset: 0, color: "#3a3a3a" }, { offset: 0.7071, color: "#e0e0e0" }] }, {
    name: "pink screen", y: -120, blendMode: MUL, effects: screen(PINK, 12)
  });
  screenSun.animate({ scale: [0, 1, "easeOutBack"] }, { at: f(4), dur: f(12) });
  wave(s, 470, 30, 240, false, BLUE, { name: "poster wave", cycle: 48, bob: 10 });
  wave(s, 550, 26, 200, true, PINK, { name: "poster wave 2", opacity: 0.75, cycle: 40, bob: 8 });

  // The misprint closes: the pink pass starts 60 px out and lands in register.
  // Title, date and venue read as one column and would be one real stack,
  // but this scene has other animated siblings ahead of it (the sun discs
  // above) and that combination hits an open resolver defect: a stack whose
  // first child is a nested non-flex group (this misprint's own group)
  // mis-measures that child's box once earlier clips in the same scene also
  // carry their own animations, and every sibling after it lands on top of
  // the group instead of below it — see the port report. Free placement
  // until that lands.
  const title = misprint(s, "TIDEWATER", 250, { name: "title", y: -140, seed: 31, off: [0, 0] });
  title.pink.animate({ offsetX: [60, 8, "easeOutQuint"], offsetY: [-40, 6, "easeOutQuint"] }, { at: 0, dur: f(2 * BAR - 20) });
  stamp(title.blue, f(2), { by: "character", staggerMs: msFor(2) });

  const dates = s.text("AUG 14–16", { size: 130, weight: 400, color: BLUE, name: "dates", font: DISPLAY, y: 60, blendMode: MUL, tracking: 0.02 });
  stamp(dates, f(BEAT));
  const where = s.text("Pier 9 · Harbour Road · 7 pm till late", { size: 42, weight: 700, color: BLUE, name: "where", y: 150, blendMode: MUL, font: SERIF, italic: true });
  where.animate({ offsetY: [20, 0, "easeOutBack"], opacity: [0, 1, "hold"] }, { at: f(2 * BEAT), dur: f(4), by: "word", staggerMs: msFor(1) });

  const ticket = s.group({ name: "ticket", y: 320, tx: { rotation: rad(-3) } });
  drop(ticket, f(3 * BEAT), -3);
  const stub = s.group({ name: "stub", parent: ticket.id, animationLinks: boil(40) });
  s.rect(700, 110, PINK, { name: "ticket stock", parent: stub.id, r: 6, blendMode: MUL });
  s.rect(4, 110, PAPER, { name: "perforation", parent: stub.id, x: 200, shape: { dash: [8, 8] } });
  // The two lines on the stub read left-to-right as one row.
  const ticketCopy = s.text("TICKETS AT THE BOATHOUSE", { size: 34, weight: 600, color: INK_ON_PINK, name: "ticket copy", font: MONO, mw: 0.5, blendMode: MUL, tracking: 1 / 34 });
  const price = s.text("£12", { size: 60, weight: 400, color: INK_ON_PINK, name: "price", font: DISPLAY, mw: 0.12, blendMode: MUL });
  s.row([ticketCopy, price], { gap: 80, align: "center", parent: stub.id, at: { x: 0, y: 0 } });

  registration(s);
  slug(s, "TIDEWATER / PROOF 4 OF 4 / APPROVED FOR PRINT");
});

// ---------------------------------------------------------------------------
// Assembly
//
// A slide, a gradient wipe and a push carry S1 through S4 into each other,
// each overlapping its predecessor by its own duration.

v.series([
  s1,
  v.transition("slide", f(5), { direction: "up", easing: "easeOutExpo" }),
  s2,
  v.transition("gradientWipe", f(5), { direction: "left", map: "noise", scale: 6, seed: 12, softness: 0.02, easing: "easeInOut" }),
  s3,
  v.transition("push", f(5), { direction: "left", easing: "easeOutExpo" }),
  s4
]);

// Everything that moves samples its clock at 12 fps. The scene groups keep
// the full rate so the slide, wipe and push between them stay smooth.
for (const sc of [s1, s2, s3, s4]) {
  for (const clip of sc.layers) {
    if (clip.animations || clip.animationLinks) clip.steppedTime = { fps: FPS / 2 };
  }
}

// The scene-finishing grain and vignette, across the whole poster.
v.adjust(
  [
    { id: "grain", type: "grain", enabled: true, amount: 0.07, size: 1.4, animate: true, seed: 5 },
    { id: "vig", type: "vignette", enabled: true, amount: 0.12, softness: 0.8 }
  ],
  { id: "finish", name: "paper grain", trackId: "t_finish" }
);

v.audio(uri("score.wav"), { id: "score", name: "swing score, 120 BPM", trackId: "t_score", volume: -3, fadeOut: 0.5 });

const PROOFS = { S1: "1 · Stamp", S2: "2 · Sunset", S3: "3 · Lineup", S4: "4 · Poster" };
v.document({
  tempo: { bpm: 120, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } },
  markers: [s1, s2, s3, s4].map((sc, i) => ({ id: `proof-${i + 1}`, timeMs: sc.group.startMs, label: Object.values(PROOFS)[i] }))
});

const saved = await v.save(nodetool.timelines, {
  name: "Tidewater — Summer jazz on the pier",
  showcase: true
});
await output("timeline", {
  name: "Tidewater — Summer jazz on the pier",
  description: "A 16-second 4:5 risograph poster that moves: three multiplied inks, a misregistered pink pass, halftone suns, cut-paper cards on stepped 12 fps time, and a swing score.",
  videoUri: uri("promo.mp4"),
  posterUri: uri("poster.jpg"),
  ...saved
});
