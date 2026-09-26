// Tidewater: a 16-second 4:5 poster for a fictional summer jazz weekend, made
// to look like a three-ink risograph print that moves.
//
// `python3 scripts/example-timelines/tidewater-score.py` writes the score.
// `node scripts/example-timelines/tidewater.mjs` writes the shipped bundle
// packages/base-nodes/nodetool/examples/timelines/tidewater.timeline.json.
// `node scripts/render-example-timeline.mjs tidewater` renders its video and poster.
//
// The print look comes from three rules. Every ink layer multiplies onto the
// paper, so pink over blue prints purple. Headlines print twice with the pink
// pass out of register. Every animated clip samples its clock at 12 fps, so
// the motion steps on twos like cut paper under a camera. Frames are at
// 24 fps against a 120 BPM score: a beat is 12 frames and a bar is 48.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createBuilder, cv, kfs, rad, tf, track } from "./lib.mjs";

const W = 1080, H = 1350, FPS = 24, FRAMES = 384, BEAT = 12, BAR = 48;

const PAPER = "#f3ecdc", PINK = "#ec3a94", BLUE = "#0078bf", YELLOW = "#ffe800";
const DISPLAY = "Bebas Neue", SERIF = "Playfair Display", MONO = "JetBrains Mono";
const MUL = "multiply";

const { ms, nid, scenes, scene, group, box, ellipse, path, pathData, text, on, loop, typewriter, sceneTracks } = createBuilder({ W, H, FPS });
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
  { id: nid("ht"), type: "stylize", enabled: true, mode: "halftone", amount: 1, scale: cell },
  { id: nid("lut"), type: "lut", enabled: true, cube: inkLut(hex), intensity: 1 }
];

/** Hand-cut paper never sits still: a small stepped rotation wobble. */
const boil = (seed, amp = 0.012) => [{ target: "rotation", kind: "wiggle", amplitude: amp, frequencyHz: 6, seed }];

/**
 * A headline printed in two passes: blue in register, pink `off` px out of
 * it. Both copies share the same animation, so the misprint travels with
 * the type. Returns the group and both passes.
 */
function misprint(str, size, o = {}) {
  const g = group({ name: o.name ?? "misprint", parent: o.parent, x: o.x ?? 0, y: o.y ?? 0, from: o.from, to: o.to, transform: o.transform });
  const style = { font: o.font ?? DISPLAY, mw: o.mw ?? 0.95, anchor: o.anchor, tracking: o.tracking, from: o.from, to: o.to, blendMode: MUL };
  const [dx, dy] = o.off ?? [9, 6];
  const pink = text(str, size, o.weight ?? 400, o.under ?? PINK, { ...style, name: "pink pass", parent: g.id, x: dx, y: dy, animationLinks: boil(o.seed ?? 1, 0.006) });
  const blue = text(str, size, o.weight ?? 400, o.over ?? BLUE, { ...style, name: "blue pass", parent: g.id, animationLinks: boil((o.seed ?? 1) + 50, 0.006) });
  return { g, pink, blue };
}

/** A stamp: overshoot scale and land. `unit` staggers it by character or word. */
function stamp(clip, f0, opts = {}) {
  return on(clip, f0, 4, [cv("scale", 1.5, 1, "easeOutBack"), cv("opacity", 0, 1, "hold")], opts);
}

/** Drop into place from above with a slight turn, the way a card lands on a table. */
function drop(clip, f0, turn = 4) {
  return on(clip, f0, 8, [cv("offsetY", -260, 0, "easeOutBack"), cv("rotation", rad(turn * 3), 0, "easeOutBack"), cv("opacity", 0, 1, "hold")]);
}

/** The paper stock: a warm sheet, mottled by a multiplied fractal field. */
function paper(seed) {
  box(W, H, PAPER, { name: "paper" });
  box(W, H, "#ffffff", {
    name: "paper fibre", blendMode: MUL, opacity: 0.22,
    effects: [{ id: nid("pf"), type: "generator", enabled: true, mode: "fractal", colorA: "#cdbf9f", colorB: "#ffffff", scale: 5, seed }]
  });
}

/** Registration crosshairs in the four corners, printed in each ink. */
function registration() {
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * (W / 2 - 46), y = sy * (H / 2 - 46);
    for (const [ink, d] of [[BLUE, 0], [PINK, 2]]) {
      path([["M", x - 20 + d, y + d], ["L", x + 20 + d, y + d], ["M", x + d, y - 20 + d], ["L", x + d, y + 20 + d]], { name: "reg mark", stroke: ink, sw: 2, blendMode: MUL });
      ellipse(22, null, { name: "reg ring", x: x + d, y: y + d, stroke: ink, sw: 2, blendMode: MUL });
    }
  }
}

/** Mono slug line along the bottom edge, the job ticket every proof carries. */
function slug(label) {
  text(label, 18, 500, BLUE, { name: "slug", font: MONO, anchor: "left", mw: 0.8, x: -W / 2 + 90, y: H / 2 - 46, blendMode: MUL, style: { letterSpacingPx: 2 } });
  [PINK, BLUE, YELLOW].forEach((ink, i) => box(26, 26, ink, { name: "ink patch", x: W / 2 - 170 + i * 32, y: H / 2 - 46, blendMode: MUL }));
}

/**
 * A wave band: a filled strip of crests that swap with troughs on a loop, a
 * standing wave that steps on twos. The crests stay inside the frame because a
 * shape is drawn in the frame raster, so a scrolled band shows its cut end.
 */
function wave(y, amp, len, flip, ink, o = {}) {
  const outline = (sign) => {
    const pts = [["M", -W / 2, y]];
    for (let k = 0, x = -W / 2; x < W / 2; k++, x += len / 2) {
      pts.push(["Q", x + len / 4, y + (k % 2 ? amp : -amp) * sign, Math.min(W / 2, x + len / 2), y]);
    }
    pts.push(["L", W / 2, H / 2], ["L", -W / 2, H / 2], ["Z"]);
    return pathData(pts);
  };
  const [a, b] = [outline(flip ? -1 : 1), outline(flip ? 1 : -1)];
  const band = path([["M", 0, 0]], { name: o.name ?? "wave", fill: ink, blendMode: MUL, opacity: o.opacity ?? 1, parent: o.parent });
  band.shapeStyle.d = a;
  const cycle = o.cycle ?? 48;
  loop(band, cycle, [kfs("offsetY", [[0, 0], [0.5, o.bob ?? 10, "easeInOut"], [1, 0, "easeInOut"]])]);
  band.animations.at(-1).styleTracks = [track("shape.d", [[0, a], [0.5, b, "easeInOut"], [1, a, "easeInOut"]])];
  return band;
}

// ---------------------------------------------------------------------------
// S1 The stamp (0–101): the name is stamped letter by letter on the beat.

function buildS1() {
  scene("S1", 0, 101);
  paper(3);
  const sun = ellipse(620, YELLOW, { name: "yellow disc", x: 150, y: -170, blendMode: MUL });
  on(sun, 0, 10, [cv("scale", 0.2, 1, "easeOutBack")]);

  const kicker = text("PIER 9 PRESENTS", 36, 500, BLUE, { name: "kicker", font: MONO, y: -470, blendMode: MUL, style: { letterSpacingPx: 10 } });
  typewriter(kicker, 2, 10);

  // One letter a beat, then WATER on the eighths.
  const tide = misprint("TIDE", 470, { name: "TIDE", y: -150, from: 0, to: 101, seed: 2 });
  for (const pass of [tide.pink, tide.blue]) stamp(pass, BEAT, { stagger: { unit: "character", offsetMs: ms(BEAT) } });
  const water = misprint("WATER", 300, { name: "WATER", y: 180, from: 0, to: 101, seed: 7, under: YELLOW, off: [-8, 7] });
  for (const pass of [water.pink, water.blue]) stamp(pass, 5 * BEAT, { stagger: { unit: "character", offsetMs: ms(BEAT / 2) } });

  const rule = box(760, 10, PINK, { name: "rule", y: 350, blendMode: MUL });
  on(rule, 7 * BEAT, 6, [cv("scaleX", 0, 1, "easeOutExpo")]);
  const sub = text("SUMMER JAZZ ON THE WATER", 34, 600, BLUE, { name: "sub", font: MONO, y: 410, blendMode: MUL, style: { letterSpacingPx: 6 } });
  typewriter(sub, 7 * BEAT + 2, 12);

  registration();
  slug("TIDEWATER / PROOF 1 OF 4 / PINK + BLUE + YELLOW");
}

// ---------------------------------------------------------------------------
// S2 Sunset (96–197): a halftone sun sinks toward the pier.

function buildS2() {
  scene("S2", 96, 197, { transitionIn: { type: "slide", durationMs: ms(6), direction: "up", easing: "easeOutExpo" } });
  paper(5);

  const sun = ellipse(560, { type: "radial", stops: [{ offset: 0, color: "#2a2a2a" }, { offset: 0.7071, color: "#c8c8c8" }] }, {
    name: "halftone sun", y: -60, blendMode: MUL, effects: screen(PINK, 16)
  });
  on(sun, 0, 2 * BAR, [cv("offsetY", -260, 120, "linear")]);
  const halo = ellipse(760, null, { name: "sun halo", y: -60, stroke: PINK, sw: 4, blendMode: MUL, shape: { dash: [18, 16] } });
  on(halo, 0, 2 * BAR, [cv("offsetY", -260, 120, "linear"), cv("rotation", 0, rad(40), "linear")]);

  // The pier: posts and a deck, printed in blue over the sea.
  const pier = group({ name: "pier", x: -140, y: 250 });
  on(pier, 0, 10, [cv("offsetX", -500, 0, "easeOutExpo")]);
  box(620, 22, BLUE, { name: "deck", parent: pier.id, blendMode: MUL });
  for (let i = 0; i < 6; i++) box(18, 150, BLUE, { name: "post", parent: pier.id, x: -280 + i * 112, y: 80, blendMode: MUL });
  box(12, 120, BLUE, { name: "lamp post", parent: pier.id, x: 260, y: -70, blendMode: MUL });
  const lamp = ellipse(40, YELLOW, { name: "lamp", parent: pier.id, x: 260, y: -140, blendMode: MUL });
  loop(lamp, BEAT * 2, [kfs("scale", [[0, 1], [0.5, 1.35, "easeOut"], [1, 1, "easeIn"]])]);

  wave(360, 26, 220, false, BLUE, { name: "wave far", opacity: 0.55, cycle: 72, bob: 8 });
  wave(430, 30, 260, true, PINK, { name: "wave mid", opacity: 0.8, cycle: 56, bob: 12 });
  wave(510, 34, 300, false, BLUE, { name: "wave near", cycle: 44, bob: 14 });

  // Gulls: two strokes each, bobbing across.
  [[-300, -420, 1], [-150, -360, 0.7], [240, -470, 0.85]].forEach(([x, y, s], i) => {
    const gull = group({ name: `gull ${i}`, x, y, s });
    on(gull, 0, 2 * BAR, [cv("offsetX", 0, 220, "linear")]);
    const wing = path([["M", -34, 0], ["Q", -16, -22, 0, 0], ["Q", 16, -22, 34, 0]], { name: "gull wings", parent: gull.id, stroke: BLUE, sw: 5, blendMode: MUL });
    loop(wing, BEAT, [kfs("scaleY", [[0, 1], [0.5, -0.6, "easeInOut"], [1, 1, "easeInOut"]])]);
  });

  const l1 = text("Three warm nights", 92, 700, BLUE, { name: "line one", font: SERIF, style: { fontStyle: "italic" }, y: -470, blendMode: MUL, tracking: -0.02 });
  on(l1, BEAT, 4, [cv("offsetY", 30, 0, "easeOutBack"), cv("opacity", 0, 1, "hold")], { stagger: { unit: "word", offsetMs: ms(BEAT) } });
  const l2 = text("of jazz on the pier.", 92, 700, PINK, { name: "line two", font: SERIF, style: { fontStyle: "italic" }, y: -370, blendMode: MUL, tracking: -0.02 });
  on(l2, 4 * BEAT, 4, [cv("offsetY", 30, 0, "easeOutBack"), cv("opacity", 0, 1, "hold")], { stagger: { unit: "word", offsetMs: ms(BEAT / 2) } });

  registration();
  slug("TIDEWATER / PROOF 2 OF 4 / SUNSET SCREEN 16 LPI");
}

// ---------------------------------------------------------------------------
// S3 The lineup (192–293): three cut-paper cards land, one per beat pair.

const NIGHTS = [
  ["FRI", "14", "The Marlowe Trio", "piano · bass · brushes", YELLOW, -4],
  ["SAT", "15", "Ada Kline Quartet", "tenor sax after dark", PINK, 3],
  ["SUN", "16", "Brass & Salt", "a nine-piece send-off", BLUE, -2]
];

function card([day, date, act, note, ink, turn], i) {
  const y = -330 + i * 290;
  const holder = group({ name: `night ${day}`, x: -40, y, transform: tf(-40, y, 1, { rotation: rad(turn) }) });
  drop(holder, 6 + i * 2 * BEAT, turn);
  // The card itself boils; the holder carries the landing.
  const g = group({ name: "card", parent: holder.id, animationLinks: boil(10 + i) });
  box(820, 240, "#fbf6ea", { name: "card stock", parent: g.id, effects: [{ id: nid("cs"), type: "dropShadow", enabled: true, offsetX: 8, offsetY: 10, blur: 0, color: "rgba(40,30,20,0.28)" }] });
  ellipse(180, ink, { name: "date disc", parent: g.id, x: -290, blendMode: MUL });
  text(date, 120, 400, ink === BLUE ? PINK : BLUE, { name: "date", parent: g.id, font: DISPLAY, x: -290, y: 6, mw: 0.2, blendMode: MUL });
  text(day, 34, 600, BLUE, { name: "day", parent: g.id, font: MONO, anchor: "left", x: -160, y: -72, mw: 0.5, blendMode: MUL, style: { letterSpacingPx: 8 } });
  text(act, 60, 700, BLUE, { name: "act", parent: g.id, font: SERIF, style: { fontStyle: "italic" }, anchor: "left", x: -164, y: 0, mw: 0.6, blendMode: MUL, tracking: -0.02 });
  text(note, 34, 500, BLUE, { name: "note", parent: g.id, font: MONO, anchor: "left", x: -160, y: 70, mw: 0.6, blendMode: MUL });
}

function buildS3() {
  scene("S3", 192, 293, { transitionIn: { type: "gradientWipe", durationMs: ms(6), direction: "left", map: "noise", scale: 6, seed: 12, softness: 0.02, easing: "easeInOut" } });
  paper(8);
  // A Bauhaus ground: a pink half circle and a yellow bar behind the cards.
  const half = path([["M", 540, -300], ["A", 420, 420, 0, 0, 0, 540, 540], ["Z"]], { name: "half circle", fill: PINK, blendMode: MUL, opacity: 0.85 });
  on(half, 0, 10, [cv("offsetX", 400, 0, "easeOutExpo")]);
  const bar = box(140, H, YELLOW, { name: "yellow bar", x: -420, blendMode: MUL });
  on(bar, 0, 10, [cv("scaleY", 0, 1, "easeOutExpo")]);

  const head = misprint("THE LINEUP", 150, { name: "lineup", y: -560, seed: 21, off: [7, 5] });
  for (const pass of [head.pink, head.blue]) stamp(pass, 0, { stagger: { unit: "character", offsetMs: ms(1) } });

  NIGHTS.forEach(card);

  // A record turning on twos in the corner.
  const rec = group({ name: "record", x: 380, y: 520 });
  on(rec, 0, 10, [cv("offsetX", 300, 0, "easeOutExpo")]);
  const disc = group({ name: "disc", parent: rec.id });
  ellipse(300, BLUE, { name: "vinyl", parent: disc.id, blendMode: MUL });
  for (const d of [250, 200, 150]) ellipse(d, null, { name: "groove", parent: disc.id, stroke: "#5fb0e0", sw: 2, blendMode: MUL });
  path([["M", 0, 0], ["L", 0, -150], ["A", 150, 150, 0, 0, 1, 106, -106], ["Z"]], { name: "sheen", parent: disc.id, fill: "rgba(255,255,255,0.35)" });
  ellipse(100, PINK, { name: "label", parent: disc.id, blendMode: MUL });
  ellipse(12, PAPER, { name: "spindle", parent: disc.id });
  loop(disc, BAR, [kfs("rotation", [[0, 0], [1, rad(360), "linear"]])]);

  registration();
  slug("TIDEWATER / PROOF 3 OF 4 / LINEUP");
}

// ---------------------------------------------------------------------------
// S4 The poster (288–383): the full lockup, and the pink pass slides into register.

function buildS4() {
  scene("S4", 288, 383, { transitionIn: { type: "push", durationMs: ms(6), direction: "left", easing: "easeOutExpo" } });
  paper(11);

  const disc = ellipse(760, YELLOW, { name: "yellow sun", y: -120, blendMode: MUL });
  on(disc, 0, 12, [cv("scale", 0.6, 1, "easeOutBack")]);
  const screenSun = ellipse(520, { type: "radial", stops: [{ offset: 0, color: "#3a3a3a" }, { offset: 0.7071, color: "#e0e0e0" }] }, {
    name: "pink screen", y: -120, blendMode: MUL, effects: screen(PINK, 12)
  });
  on(screenSun, 4, 12, [cv("scale", 0, 1, "easeOutBack")]);
  wave(470, 30, 240, false, BLUE, { name: "poster wave", cycle: 48, bob: 10 });
  wave(550, 26, 200, true, PINK, { name: "poster wave 2", opacity: 0.75, cycle: 40, bob: 8 });

  // The misprint closes: the pink pass starts 60 px out and lands in register.
  const title = misprint("TIDEWATER", 250, { name: "title", y: -140, seed: 31, off: [0, 0] });
  on(title.pink, 0, 2 * BAR - 20, [cv("offsetX", 60, 8, "easeOutQuint"), cv("offsetY", -40, 6, "easeOutQuint")]);
  stamp(title.blue, 2, { stagger: { unit: "character", offsetMs: ms(2) } });

  const dates = text("AUG 14–16", 130, 400, BLUE, { name: "dates", font: DISPLAY, y: 60, blendMode: MUL, tracking: 0.02 });
  stamp(dates, BEAT);
  const where = text("Pier 9 · Harbour Road · 7 pm till late", 42, 700, BLUE, { name: "where", font: SERIF, style: { fontStyle: "italic" }, y: 150, blendMode: MUL });
  on(where, 2 * BEAT, 4, [cv("offsetY", 20, 0, "easeOutBack"), cv("opacity", 0, 1, "hold")], { stagger: { unit: "word", offsetMs: ms(1) } });

  const ticket = group({ name: "ticket", y: 320, transform: tf(0, 320, 1, { rotation: rad(-3) }) });
  drop(ticket, 3 * BEAT, -3);
  const stub = group({ name: "stub", parent: ticket.id, animationLinks: boil(40) });
  box(700, 110, PINK, { name: "ticket stock", parent: stub.id, r: 6, blendMode: MUL });
  box(4, 110, PAPER, { name: "perforation", parent: stub.id, x: 200, shape: { dash: [8, 8] } });
  text("TICKETS AT THE BOATHOUSE", 34, 600, BLUE, { name: "ticket copy", parent: stub.id, font: MONO, x: -70, mw: 0.5, blendMode: MUL, style: { letterSpacingPx: 1 } });
  text("£12", 60, 400, BLUE, { name: "price", parent: stub.id, font: DISPLAY, x: 272, mw: 0.12, blendMode: MUL });

  registration();
  slug("TIDEWATER / PROOF 4 OF 4 / APPROVED FOR PRINT");
}

// ---------------------------------------------------------------------------
// Assembly

buildS1(); buildS2(); buildS3(); buildS4();

const tracks = [
  { id: "t_finish", name: "press finish", type: "video", index: 0, visible: true, locked: false },
  { id: "t_scenes", name: "proofs", type: "video", index: 1, visible: true, locked: false }
];
const layers = sceneTracks(tracks.length);
tracks.push(...layers.tracks);

// Everything that moves samples its clock at 12 fps. The scene groups keep
// the full rate so the slides, wipes and pushes between them stay smooth.
for (const clip of layers.clips) if (clip.animations || clip.animationLinks) clip.steppedTime = { fps: FPS / 2 };

// One folder per proof, and each layer track named after its first clip.
const PROOFS = { S1: "1 · Stamp", S2: "2 · Sunset", S3: "3 · Lineup", S4: "4 · Poster" };
const trackFolders = Object.entries(PROOFS).map(([s, name]) => ({ id: `f_${s}`, name }));
for (const t of layers.tracks) {
  const s = t.id.split("_")[1];
  t.folderId = `f_${s}`;
  t.name = layers.clips.find((clip) => clip.trackId === t.id).name;
}

const clips = [...layers.clips, ...scenes.map((s) => s.group)];
clips.push({
  id: "finish", name: "paper grain", trackId: "t_finish", startMs: 0, durationMs: ms(FRAMES), mediaType: "adjustment", sourceType: "imported", status: "generated", locked: false, versions: [],
  effects: [
    { id: "grain", type: "grain", enabled: true, amount: 0.07, size: 1.4, animate: true, seed: 5 },
    { id: "vig", type: "vignette", enabled: true, amount: 0.12, softness: 0.8 }
  ]
});
tracks.push({ id: "t_score", name: "swing score", type: "audio", index: tracks.length, visible: true, locked: false });
clips.push({
  id: "score", name: "swing score, 120 BPM", trackId: "t_score", startMs: 0, durationMs: ms(FRAMES), mediaType: "audio", sourceType: "imported",
  status: "generated", locked: false, versions: [], currentAssetId: uri("score.wav"), volumeDb: -3, fadeOutMs: 500
});

const bundle = {
  name: "Tidewater — Summer jazz on the pier",
  description: "A 16-second 4:5 risograph poster that moves: three multiplied inks, a misregistered pink pass, halftone suns, cut-paper cards on stepped 12 fps time, and a swing score.",
  fps: FPS,
  width: W,
  height: H,
  durationMs: ms(FRAMES),
  videoUri: uri("promo.mp4"),
  posterUri: uri("poster.jpg"),
  document: {
    tracks, trackFolders, clips,
    tempo: { bpm: 120, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } },
    markers: scenes.map((s, i) => ({ id: `proof-${i + 1}`, timeMs: ms(i * 2 * BAR), label: Object.values(PROOFS)[i] }))
  }
};

const out = join(dirname(fileURLToPath(import.meta.url)), "../../packages/base-nodes/nodetool/examples/timelines/tidewater.timeline.json");
writeFileSync(out, `${JSON.stringify(bundle)}\n`);
console.log(`${clips.length} clips, ${tracks.length} tracks -> ${out}`);
