// Kite: a 15-second savings-app ad built only from timeline motion graphics.
//
// `node scripts/example-timelines/kite.mjs` writes the shipped bundle
// packages/base-nodes/nodetool/examples/timelines/kite.timeline.json.
// `node scripts/render-example-timeline.mjs kite` renders its video and poster.
//
// Frames are at 30 fps. Positions are px from the frame centre. Each scene is a
// group clip on the scenes track; its layers alternate between two track banks
// so a transition's overlapping scenes never share a track.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = 1920, H = 1080, FPS = 30, FRAMES = 450;
const ms = (f) => Math.floor((f * 1000) / FPS);
const rad = (d) => (d * Math.PI) / 180;

const INK = "#06110e", INK2 = "#0c2a21", CARD = "#0f1f1a";
const LINE = "rgba(167,243,208,0.16)", TEXT = "#f4fbf8", DIM = "#8fb3a6";
const MINT = "#34d399", LIME = "#d9f99d", CORAL = "#fb7185";
const KITE = { type: "linear", angle: 0, stops: [{ offset: 0, color: MINT }, { offset: 1, color: LIME }] };
const KITE_UP = { type: "linear", angle: 90, stops: [{ offset: 0, color: LIME }, { offset: 1, color: MINT }] };
const DISPLAY = "Space Grotesk";
const EASE_IO = "cubic-bezier(0.65,0,0.35,1)", EASE_OUT = "cubic-bezier(0.33,1,0.68,1)";

const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------------------
// Document plumbing

let idc = 0;
const nid = (p) => `${p}${++idc}`;
const scenes = [];
let cur = null;

function tf(x = 0, y = 0, s = 1, extra = {}) {
  return { position: { x, y }, scale: { x: s, y: s }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, ...extra };
}

function scene(name, bank, start, end, extra = {}) {
  const s = { name, bank, start, end, layers: [] };
  s.group = {
    id: name, name, trackId: "t_scenes", startMs: ms(start), durationMs: ms(end + 1) - ms(start),
    mediaType: "group", sourceType: "imported", status: "generated", locked: false, versions: [],
    transform: tf(), ...extra
  };
  scenes.push(s);
  cur = s;
  return s;
}

/** Adds a clip to the current scene, above everything added before it. */
function add(mediaType, o) {
  const s = cur;
  const from = o.from ?? s.start;
  const to = o.to ?? s.end;
  const clip = {
    id: o.id ?? nid(mediaType[0]), name: o.name ?? mediaType, startMs: ms(from), durationMs: ms(to + 1) - ms(from),
    mediaType, sourceType: "imported", status: "generated", locked: false, versions: [],
    parentId: o.parent ?? s.name, transform: o.transform ?? tf(o.x ?? 0, o.y ?? 0, o.s ?? 1, o.tx ?? {})
  };
  for (const k of ["shapeStyle", "textStyle", "effects", "animations", "opacity", "blendMode", "layout", "repeater", "motionBlur", "temporalEcho"]) {
    if (o[k] !== undefined) clip[k] = o[k];
  }
  clip._z = s.layers.length;
  clip._from = from;
  s.layers.push(clip);
  return clip;
}

const group = (o) => add("group", o);

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
  const style = { text: str, fontFamily: o.font ?? "Inter", fontSizePx: size, fontWeight: weight, color, align: anchor, maxWidthFrac: mw, ...(o.style ?? {}) };
  if (o.tracking) style.letterSpacingPx = o.tracking * size;
  if (o.fill) style.fill = o.fill;
  return add("text", { ...o, x, textStyle: style });
}

const cv = (property, a, b, easing = "easeOutExpo") => ({ property, keyframes: [{ t: 0, value: a }, { t: 1, value: b, easing }] });
const kfs = (property, list) => ({ property, keyframes: list.map(([t, value, easing]) => (easing ? { t, value, easing } : { t, value })) });
const NOOP = cv("opacity", 1, 1, "linear");
const REST = { opacity: 1, scale: 1, scaleX: 1, scaleY: 1, trimEnd: 1, wipeProgress: 1 };

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

/** A looping custom animation with a cycle of `dur` frames. */
function loop(clip, dur, curves) {
  clip.animations = [...(clip.animations ?? []), { id: nid("a"), role: "loop", preset: "custom", delayMs: 0, durationMs: ms(dur), custom: { curves } }];
  return clip;
}

/** Grow a clip from its bottom edge: scaleY and a matching offset share one easing. */
function grow(clip, f0, dur, h, easing) {
  return on(clip, f0, dur, [cv("scaleY", 0, 1, easing), cv("offsetY", h / 2, 0, easing)]);
}

// ---------------------------------------------------------------------------
// Shared parts

function backdrop(colorB = INK2, opacity = 0.7, seed = 3) {
  box(W, H, INK, { name: "ink" });
  return box(W, H, INK, {
    name: "field", opacity,
    effects: [{ id: "gf", type: "generator", enabled: true, mode: "gradientField", colorA: INK, colorB, scale: 3, animate: true, seed }]
  });
}

function glow(size, alpha, o = {}) {
  const c = (a) => `rgba(52,211,153,${a})`;
  return ellipse(size, { type: "radial", stops: [{ offset: 0, color: c(alpha) }, { offset: 0.35, color: c(alpha * 0.4) }, { offset: 0.7071, color: c(0) }] }, { name: "glow", ...o });
}

function flash(f0, dur, peak) {
  const c = box(W, H, "#ffffff", { name: "flash", from: cur.start + f0, to: Math.min(cur.end, cur.start + f0 + dur), blendMode: "screen" });
  return on(c, f0, dur, [cv("opacity", peak, 0, "linear")]);
}

/** Text that slams in: large to rest size, out of a blur. */
function slam(clip, f0, from = 1.35) {
  on(clip, f0, 8, [cv("scale", from, 1), cv("blur", 26, 0, "easeOut")]);
  return on(clip, f0, 3, [cv("opacity", 0, 1, "linear")]);
}

/** Fade and rise into place. */
function rise(clip, f0, dur = 12, dy = 24, opts) {
  return on(clip, f0, dur, [cv("opacity", 0, 1, "easeOut"), cv("offsetY", dy, 0)], opts);
}

/**
 * The Kite mark: a kite outline with its spars, a gradient sail and a tail.
 * `f0` null draws it complete.
 */
function mark(x, y, f0, parent) {
  const g = group({ name: "mark", parent, x, y, effects: [{ id: "mg", type: "glow", enabled: true, radius: 36, intensity: 0.7, color: MINT }] });
  const P = { top: [0, -96], right: [66, -14], bottom: [0, 104], left: [-66, -14] };
  const outline = [["M", ...P.top], ["L", ...P.right], ["L", ...P.bottom], ["L", ...P.left], ["Z"]];
  const sail = path(outline, { name: "sail", parent: g.id, fill: KITE_UP });
  const edge = path(outline, { name: "edge", parent: g.id, stroke: TEXT, sw: 6 });
  const spine = path([["M", ...P.top], ["L", ...P.bottom]], { name: "spine", parent: g.id, stroke: INK, sw: 4 });
  const spar = path([["M", ...P.left], ["L", ...P.right]], { name: "spar", parent: g.id, stroke: INK, sw: 4 });
  const tail = path([["M", 0, 104], ["C", 26, 128, -26, 146, 4, 170]], { name: "tail", parent: g.id, stroke: MINT, sw: 5 });
  if (f0 !== null) {
    on(edge, f0, 16, [cv("trimEnd", 0, 1, EASE_IO)]);
    on(sail, f0 + 12, 10, [cv("opacity", 0, 1, "easeOut"), cv("scale", 0.85, 1, "spring(170,16,1)")]);
    on(spine, f0 + 16, 8, [cv("trimEnd", 0, 1)]);
    on(spar, f0 + 18, 8, [cv("trimEnd", 0, 1)]);
    on(tail, f0 + 20, 14, [cv("trimEnd", 0, 1, "easeOut")]);
  }
  return g;
}

function wordmark(x, y, f0, parent) {
  const w = text("Kite", 176, 700, TEXT, { name: "wordmark", parent, anchor: "left", mw: 0.3, x, y, font: DISPLAY, tracking: -0.04 });
  if (f0 !== null) on(w, f0, 12, [cv("offsetY", 50, 0), cv("opacity", 0, 1, "easeOut")], { stagger: { unit: "character", offsetMs: 45 } });
  return w;
}

/** A small uppercase label with a wipe entrance. */
function kicker(str, x, y, f0, o = {}) {
  const k = text(str.toUpperCase(), 28, 600, MINT, { name: "kicker", anchor: "left", mw: 0.4, x, y, style: { letterSpacingPx: 5 }, ...o });
  on(k, f0, 10, [cv("wipeProgress", 0, 1), cv("opacity", 0, 1)]);
  k.animations.at(-1).custom.mask = { direction: "left", softness: 0.05 };
  return k;
}

/** A pill fitted around a label, with an optional leading dot. */
function pill(label, size, weight, color, o = {}) {
  const g = group({ name: o.name ?? "pill", parent: o.parent, x: o.x ?? 0, y: o.y ?? 0, from: o.from, to: o.to });
  const t = text(label, size, weight, color, { parent: g.id, x: o.dot ? 12 : 0, mw: 0.4, from: o.from, to: o.to });
  const p = box(300, size * 2.2, o.fill ?? CARD, { parent: g.id, r: size * 1.1, stroke: o.stroke ?? LINE, from: o.from, to: o.to, effects: o.shadow ? [{ id: nid("sh"), type: "dropShadow", enabled: true, offsetX: 0, offsetY: 12, blur: 30, color: "rgba(0,0,0,0.4)" }] : undefined, layout: { kind: "relative", targetClipId: t.id, side: "center", fitText: { paddingXPx: o.padX ?? size * 1.4, paddingYPx: size * 0.55 } } });
  p._z = t._z - 0.5;
  if (o.dot) ellipse(size * 0.5, o.dot, { parent: g.id, from: o.from, to: o.to, layout: { kind: "relative", targetClipId: t.id, side: "left", gapPx: 12 } });
  return g;
}

// ---------------------------------------------------------------------------
// S1 The drain (0–89): the paycheck disappears word by word.

function buildS1() {
  scene("S1", "A", 0, 89);
  backdrop("#2a0f14", 0.55, 2);
  // Streaks of money leaving the frame: three depths, each a repeater whose
  // copies are phase-shifted in time so the flow never pulses.
  const streaks = group({ name: "streaks", opacity: 0.9, transform: tf(0, 0, 1, { rotation: rad(-8) }) });
  const layer = (name, w, h, color, cycle, count, dy, opacity, seed) => {
    const c = box(w, h, color, {
      name, parent: streaks.id, r: h / 2, opacity, y: -H / 2 - dy,
      repeater: { count, positionStep: { x: 0, y: dy }, timeStepMs: Math.round((ms(cycle) / count) * 3.7) % ms(cycle) },
      motionBlur: { samplesPerFrame: 6, shutterAngle: 240 }
    });
    const drift = hash(seed) * 400;
    loop(c, cycle, [kfs("offsetX", [[0, W * 0.8 + drift], [1, -W * 0.8 + drift]])]);
  };
  layer("streak-far", 260, 3, "rgba(143,179,166,0.6)", 34, 14, 84, 0.8, 1);
  layer("streak-mid", 420, 5, "rgba(251,113,133,0.75)", 24, 10, 118, 0.9, 2);
  layer("streak-near", 640, 8, "rgba(244,251,248,0.8)", 16, 6, 190, 0.85, 3);
  glow(1400, 0, { name: "text-scrim" }).shapeStyle.fillStyle = { type: "radial", stops: [{ offset: 0, color: "rgba(6,17,14,0.85)" }, { offset: 0.4, color: "rgba(6,17,14,0.55)" }, { offset: 0.7071, color: "rgba(6,17,14,0)" }] };

  // Word cards, 18 frames apiece; the last lands in coral and glitches.
  const words = [["Payday.", 0], ["Rent.", 18], ["Groceries.", 36], ["Subscriptions.", 54], ["Gone.", 72]];
  words.forEach(([word, f0], i) => {
    const last = i === words.length - 1;
    const t = text(word, 188, 700, last ? CORAL : TEXT, {
      name: `word-${i}`, font: DISPLAY, y: -70, tracking: -0.045, from: f0, to: last ? 89 : f0 + 17,
      effects: last ? [{ id: "gl", type: "stylize", enabled: true, mode: "glitch", amount: 0, seed: 4, animate: true }] : undefined
    });
    slam(t, f0, i === 0 ? 1.2 : 1.35);
    if (last) on(t, 80, 10, [NOOP], { styleTracks: [{ target: "effect.gl.amount", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 0.6 }] }] });
    else on(t, f0 + 12, 6, [cv("offsetX", 0, -60, "easeIn"), cv("opacity", 1, 0, "easeIn")]);
  });

  // The balance drains underneath: a ticker and a bar that empties from the right.
  const bal = group({ name: "balance", y: 170 });
  rise(bal, 4, 12, 20);
  text("BALANCE", 28, 600, DIM, { parent: bal.id, anchor: "left", mw: 0.2, x: -300, y: -34, style: { letterSpacingPx: 5 } });
  const amount = text("$2,480", 56, 700, TEXT, { name: "balance-amount", parent: bal.id, anchor: "right", mw: 0.3, x: 300, y: -40 });
  on(amount, 6, 80, [NOOP], { textAnimator: { kind: "ticker", from: 2480, to: 12, prefix: "$", groupSeparator: "," }, easing: EASE_IO });
  on(amount, 50, 36, [NOOP], { styleTracks: [{ target: "text.color", keyframes: [{ t: 0, value: TEXT }, { t: 1, value: CORAL, easing: "easeIn" }] }] });
  box(600, 10, "rgba(143,179,166,0.18)", { parent: bal.id, r: 5, y: 16 });
  const bar = box(600, 10, MINT, { name: "balance-bar", parent: bal.id, r: 5, y: 16 });
  const drain = (p) => kfs(p, [[0, p === "scaleX" ? 1 : 0], [1, p === "scaleX" ? 0.005 : -300 * 0.995, EASE_IO]]);
  on(bar, 6, 80, [drain("scaleX"), drain("offsetX")]);
  on(bar, 50, 36, [NOOP], { styleTracks: [{ target: "shape.fill", keyframes: [{ t: 0, value: MINT }, { t: 1, value: CORAL, easing: "easeIn" }] }] });
}

// ---------------------------------------------------------------------------
// S2 Meet Kite (90–172, runs under the whip into S3)

const LOGO = { markX: -180, wordX: -60 };

function buildS2() {
  scene("S2", "B", 90, 172);
  box(W, H, INK, { name: "ink" });
  const g = glow(1100, 0.22, { y: -20 });
  on(g, 0, 30, [cv("scale", 0.6, 1), cv("opacity", 0, 1, "easeOut")]);
  const row = group({ name: "logo", y: -70, s: 1.15 });
  on(row, 0, 82, [cv("scale", 0.96, 1.04, "linear")]);
  mark(LOGO.markX, -20, 2, row.id);
  wordmark(LOGO.wordX, 0, 14, row.id);
  const meet = text("Meet", 34, 600, DIM, { anchor: "left", mw: 0.2, x: LOGO.wordX * 1.15 + 6, y: -190, style: { letterSpacingPx: 4 } });
  rise(meet, 10, 10, 14);
  const tag = text("Savings on autopilot.", 54, 500, TEXT, { y: 175, font: DISPLAY, tracking: -0.01 });
  on(tag, 30, 14, [cv("offsetY", 24, 0), cv("opacity", 0, 1, "easeOut")], { stagger: { unit: "word", offsetMs: 90 } });
  flash(0, 10, 0.85);
}

// ---------------------------------------------------------------------------
// S3 The app (165–292, runs under the wipe into S4)

function phoneChart(parent) {
  // An upward, slightly noisy trend across the phone's chart card.
  const pts = Array.from({ length: 9 }, (_, i) => {
    const x = -170 + i * (340 / 8);
    const y = -20 - i * 15 - Math.sin(i * 1.3) * 16 - (hash(i + 12) - 0.5) * 14;
    return [x, Math.round(y)];
  });
  pts[8][1] = -150;
  const area = path([["M", pts[0][0], 60], ...pts.map(([x, y]) => ["L", x, y]), ["L", pts[8][0], 60], ["Z"]], {
    name: "chart-area", parent, fill: { type: "linear", angle: 90, stops: [{ offset: 0, color: "rgba(52,211,153,0.35)" }, { offset: 1, color: "rgba(52,211,153,0)" }] }
  });
  const line = path(pts.map(([x, y], i) => [i ? "L" : "M", x, y]), {
    name: "chart-line", parent, stroke: MINT, sw: 6, effects: [{ id: "lg", type: "glow", enabled: true, radius: 16, intensity: 0.9, color: MINT }]
  });
  const [ex, ey] = pts[8];
  const dot = ellipse(22, LIME, { name: "chart-dot", parent, x: ex, y: ey, effects: [{ id: "dg", type: "glow", enabled: true, radius: 20, intensity: 1, color: LIME }] });
  return { area, line, dot };
}

function buildS3() {
  scene("S3", "A", 165, 292, { transitionIn: { type: "whip", durationMs: 250, direction: "right", easing: "easeInOut" } });
  backdrop(INK2, 0.6, 5);
  glow(1300, 0.14, { x: -420, y: 40 });

  // The phone, tilted toward the copy, rising in on a spring and floating.
  const phone = group({ name: "phone", x: -430, y: 20, tx: { rotationY: 14, rotationX: 4, perspective: 2600 } });
  on(phone, 0, 22, [cv("offsetY", 180, 0, "spring(160,20,1)"), cv("opacity", 0, 1, "easeOut")]);
  on(phone, 0, 127, [kfs("rotationY", [[0, 0], [1, -6, "easeInOut"]])]);
  box(460, 920, CARD, { name: "phone-body", parent: phone.id, r: 64, stroke: "rgba(167,243,208,0.28)", sw: 2, effects: [{ id: "psh", type: "dropShadow", enabled: true, offsetX: 0, offsetY: 40, blur: 90, color: "rgba(0,0,0,0.6)" }] });
  box(130, 30, "#020806", { parent: phone.id, r: 15, y: -420 });
  text("Saved this month", 28, 500, DIM, { parent: phone.id, anchor: "left", mw: 0.2, x: -180, y: -345 });
  const saved = text("$1,284", 92, 800, TEXT, { name: "saved", parent: phone.id, anchor: "left", mw: 0.25, x: -184, y: -272, tracking: -0.03, fill: KITE });
  on(saved, 8, 50, [NOOP], { textAnimator: { kind: "ticker", from: 0, to: 1284, prefix: "$", groupSeparator: "," }, easing: "easeOutExpo" });
  const delta = text("+18% vs last month", 28, 600, MINT, { parent: phone.id, anchor: "left", mw: 0.2, x: -180, y: -206 });
  rise(delta, 44, 10, 10);

  const chart = group({ name: "chart", parent: phone.id, y: -20 });
  box(400, 250, "rgba(244,251,248,0.03)", { parent: chart.id, r: 24, y: -40, stroke: LINE });
  const { area, line, dot } = phoneChart(chart.id);
  on(line, 12, 40, [cv("trimEnd", 0, 1, EASE_IO)]);
  on(area, 12, 40, [cv("wipeProgress", 0, 1, EASE_IO)]);
  area.animations.at(-1).custom.mask = { direction: "left", softness: 0.02 };
  on(dot, 50, 14, [cv("scale", 0, 1, "spring(200,12,1)")]);
  loop(dot, 30, [kfs("scale", [[0, 1], [0.5, 1.25, "easeInOut"], [1, 1, "easeInOut"]])]);

  // The goal card: a ring that fills to 78 percent.
  const goal = group({ name: "goal", parent: phone.id, y: 260 });
  rise(goal, 18, 14, 30);
  box(400, 230, "rgba(244,251,248,0.04)", { parent: goal.id, r: 28, stroke: LINE });
  ellipse(140, null, { parent: goal.id, x: -105, stroke: "rgba(143,179,166,0.22)", sw: 14 });
  const ring = ellipse(140, null, { name: "goal-ring", parent: goal.id, x: -105, stroke: LIME, sw: 14, shape: { lineCap: "round" }, transform: tf(-105, 0, 1, { rotation: rad(-90) }) });
  // Held at 78% to the clip end, so the curve stays an entrance and the ring
  // is empty, not full, before it starts.
  on(ring, 26, 102, [kfs("trimEnd", [[0, 0], [44 / 102, 0.78, EASE_IO], [1, 0.78, "linear"]])]);
  const pct = text("0%", 34, 700, TEXT, { parent: goal.id, x: -105, y: 0, mw: 0.1 });
  on(pct, 26, 44, [NOOP], { textAnimator: { kind: "ticker", from: 0, to: 78, suffix: "%" }, easing: EASE_IO });
  text("Lisbon trip", 28, 600, TEXT, { parent: goal.id, anchor: "left", mw: 0.12, x: -10, y: -22 });
  text("$1,560 of $2,000", 28, 500, DIM, { parent: goal.id, anchor: "left", mw: 0.12, x: -10, y: 16 });

  // Round-ups pop out of the phone's edge and stack, then clear.
  [["+$0.60", "Coffee", 26], ["+$0.35", "Lunch", 38], ["+$0.80", "Train", 50]].forEach(([amt, what, f0], i) => {
    const chip = pill(`${amt}  ·  ${what}`, 28, 600, TEXT, { name: `roundup-${i}`, x: -120, y: -150 + i * 84, dot: MINT, shadow: true, fill: "#133329", from: 165 + f0, to: 165 + 122 });
    on(chip, f0, 14, [cv("scale", 0.5, 1, "spring(220,14,1)"), cv("offsetX", -90, 0, "spring(220,18,1)"), cv("opacity", 0, 1, "linear")]);
    on(chip, 104 + i * 3, 10, [cv("opacity", 1, 0, "easeIn"), cv("offsetY", 0, -20, "easeIn")]);
  });

  // The copy on the right.
  kicker("How it works", 110, -300, 6);
  const h1 = text("Every purchase", 76, 700, TEXT, { anchor: "left", mw: 0.46, x: 110, y: -210, font: DISPLAY, tracking: -0.035 });
  on(h1, 10, 14, [cv("offsetY", 40, 0), cv("opacity", 0, 1, "easeOut")], { stagger: { unit: "word", offsetMs: 90 } });
  const h2 = text("rounds up to savings.", 76, 700, TEXT, { anchor: "left", mw: 0.46, x: 110, y: -124, font: DISPLAY, tracking: -0.035, fill: KITE });
  on(h2, 16, 14, [cv("offsetY", 40, 0), cv("opacity", 0, 1, "easeOut")], { stagger: { unit: "word", offsetMs: 90 } });
  ["Round-ups on every card", "Goals that fund themselves", "Weekly insights, no spreadsheets"].forEach((label, i) => {
    const rowY = 40 + i * 92;
    const r = group({ name: `feature-${i}`, x: 110, y: rowY });
    on(r, 42 + i * 8, 14, [cv("offsetX", 40, 0), cv("opacity", 0, 1, "easeOut")]);
    ellipse(52, "rgba(52,211,153,0.16)", { parent: r.id, x: 26, stroke: "rgba(52,211,153,0.5)", sw: 1.5 });
    const check = path([["M", 14, 1], ["L", 23, 10], ["L", 39, -9]], { parent: r.id, stroke: MINT, sw: 4 });
    on(check, 50 + i * 8, 10, [cv("trimEnd", 0, 1, "easeOut")]);
    text(label, 36, 500, TEXT, { parent: r.id, anchor: "left", mw: 0.4, x: 78, y: 0 });
  });
}

// ---------------------------------------------------------------------------
// S4 Growth (282–385, runs under the iris into S5)

function buildS4() {
  scene("S4", "B", 282, 385, { transitionIn: { type: "gradientWipe", durationMs: 350, direction: "left", map: "noise", seed: 6, easing: "easeInOutExpo" } });
  backdrop(INK2, 0.8, 7);
  const cam = group({ name: "chart-rig", tx: { rotationX: 10, perspective: 2800 } });
  on(cam, 0, 103, [cv("scale", 1, 1.06, "linear")]);
  const n = 12, bw = 70, gap = 30, base = 330;
  const x0 = -((n * bw + (n - 1) * gap) / 2) + bw / 2;
  for (let k = 0; k < 4; k++) box(n * bw + (n - 1) * gap + 60, 2, "rgba(143,179,166,0.14)", { parent: cam.id, y: base - k * 120 });
  const months = "JFMAMJJASOND";
  let lastTop = 0;
  for (let i = 0; i < n; i++) {
    const h = Math.round(70 + 330 * Math.pow(i / (n - 1), 1.35) + (hash(i + 40) - 0.5) * 50);
    const x = x0 + i * (bw + gap);
    const bar = box(bw, h, KITE_UP, { name: `bar-${i}`, parent: cam.id, x, y: base - h / 2, r: 12, effects: i === n - 1 ? [{ id: "bg", type: "glow", enabled: true, radius: 30, intensity: 0.9, color: LIME }] : undefined });
    grow(bar, 10 + i * 2.5, 18, h, "spring(170,17,1)");
    const lbl = text(months[i], 28, 600, DIM, { parent: cam.id, x, y: base + 34, mw: 0.03 });
    rise(lbl, 6 + i * 2, 8, 10);
    if (i === n - 1) lastTop = base - h;
  }
  const callout = pill("+$420 in December", 28, 600, INK, { name: "callout", parent: cam.id, x: x0 + (n - 1) * (bw + gap) - 110, y: lastTop - 70, fill: LIME, stroke: "rgba(0,0,0,0)" });
  on(callout, 52, 14, [cv("scale", 0.4, 1, "spring(220,14,1)"), cv("offsetY", 30, 0, "spring(220,18,1)"), cv("opacity", 0, 1, "linear")]);

  kicker("Set it once", -700, -400, 4);
  const head = text("Watch it grow.", 104, 700, TEXT, { anchor: "left", mw: 0.5, x: -700, y: -310, font: DISPLAY, tracking: -0.04 });
  on(head, 8, 14, [cv("offsetY", 40, 0), cv("opacity", 0, 1, "easeOut")], { stagger: { unit: "word", offsetMs: 100 } });
  const total = text("$3,650", 120, 800, TEXT, { name: "year-total", anchor: "right", mw: 0.35, x: 700, y: -320, tracking: -0.035, fill: KITE });
  rise(total, 10, 10, 20);
  on(total, 10, 62, [NOOP], { textAnimator: { kind: "ticker", from: 0, to: 3650, prefix: "$", groupSeparator: "," }, easing: EASE_OUT });
  const sub = text("saved in year one", 30, 500, DIM, { anchor: "right", mw: 0.3, x: 700, y: -236 });
  rise(sub, 20, 12, 14);
}

// ---------------------------------------------------------------------------
// S5 End card (376–449)

function buildS5() {
  const s = scene("S5", "A", 376, 449, { transitionIn: { type: "iris", durationMs: 300, softness: 0.05, easing: "easeInOut" } });
  s.group.animations = [{ id: nid("a"), role: "out", preset: "custom", delayMs: 0, durationMs: ms(12), custom: { curves: [cv("opacity", 1, 0, "easeIn")] } }];
  backdrop("#0f3b2e", 0.9, 9);
  const g = glow(1200, 0.26, { y: -40 });
  loop(g, 60, [kfs("scale", [[0, 1], [0.5, 1.06, "easeInOut"], [1, 1, "easeInOut"]])]);
  const logo = group({ name: "end-logo", y: -150 });
  on(logo, 0, 22, [cv("scale", 1.18, 1)]);
  on(logo, 0, 6, [cv("opacity", 0, 1, "linear")]);
  mark(LOGO.markX, -20, null, logo.id);
  wordmark(LOGO.wordX, 0, null, logo.id);
  const tag = text("Savings on autopilot.", 68, 700, TEXT, { y: 95, font: DISPLAY, tracking: -0.03, fill: KITE });
  on(tag, 8, 14, [cv("offsetY", 24, 0), cv("opacity", 0, 1, "easeOut")]);
  const cta = pill("Free on iOS & Android", 34, 600, INK, { name: "cta", y: 210, fill: TEXT, stroke: "rgba(0,0,0,0)", padX: 40 });
  on(cta, 18, 16, [cv("offsetY", 40, 0, "spring(180,20,1)"), cv("opacity", 0, 1, "easeOut")]);
  const leak = box(W, H, null, { name: "light-leak", to: 376 + 16, blendMode: "screen", effects: [{ id: "lk", type: "generator", enabled: true, mode: "lightLeak", colorA: LIME, colorB: MINT, seed: 3, animate: true, amount: 1 }] });
  on(leak, 0, 16, [kfs("opacity", [[0, 0], [0.4, 0.55, "easeOut"], [1, 0, "easeIn"]])]);
  flash(0, 8, 0.6);
}

// ---------------------------------------------------------------------------
// Assembly

buildS1(); buildS2(); buildS3(); buildS4(); buildS5();

// The hard cut S1 → S2 at frame 90 gets a glitch across frames 87–92.
const GLITCH = [0.3, 0.8, 1, 0.9, 0.5, 0.15];
const glitchJoin = {
  id: "glitch-join", name: "glitch 87–92", trackId: "t_glitch", startMs: ms(87), durationMs: ms(93) - ms(87), mediaType: "adjustment", sourceType: "imported", status: "generated", locked: false, versions: [],
  effects: [
    { id: "gx", type: "stylize", enabled: true, mode: "glitch", amount: 0, seed: 11, animate: true },
    { id: "rx", type: "stylize", enabled: true, mode: "rgbSplit", amount: 0 }
  ],
  animations: [{
    id: "glitch-join-a", role: "in", preset: "custom", delayMs: 0, durationMs: ms(93) - ms(87), custom: { curves: [NOOP] },
    styleTracks: [
      { target: "effect.gx.amount", keyframes: GLITCH.map((value, i) => ({ t: i / (GLITCH.length - 1), value, easing: "linear" })) },
      { target: "effect.rx.amount", keyframes: GLITCH.map((value, i) => ({ t: i / (GLITCH.length - 1), value: value * 18, easing: "linear" })) }
    ]
  }]
};

const tracks = [
  { id: "t_finish", name: "finish", type: "video", index: 0, visible: true, locked: false },
  { id: "t_glitch", name: "glitch", type: "video", index: 1, visible: true, locked: false },
  { id: "t_scenes", name: "scenes", type: "video", index: 2, visible: true, locked: false }
];
const clips = [glitchJoin];
let offset = tracks.length;
for (const bank of ["A", "B"]) {
  const inBank = scenes.filter((s) => s.bank === bank);
  const size = Math.max(...inBank.map((s) => s.layers.length));
  for (let i = 0; i < size; i++) tracks.push({ id: `t_${bank}${i}`, name: `${bank}${i}`, type: "video", index: offset + i, visible: true, locked: false });
  for (const s of inBank) {
    [...s.layers].sort((a, b) => a._z - b._z).forEach((clip, i) => {
      clip.trackId = `t_${bank}${size - 1 - i}`;
      delete clip._z;
      delete clip._from;
      clips.push(clip);
    });
  }
  offset += size;
}
for (const s of scenes) clips.push(s.group);
clips.push({
  id: "finish", name: "grain + dither", trackId: "t_finish", startMs: 0, durationMs: ms(FRAMES), mediaType: "adjustment", sourceType: "imported", status: "generated", locked: false, versions: [],
  effects: [
    { id: "vig", type: "vignette", enabled: true, amount: 0.25, softness: 0.7 },
    { id: "grain", type: "grain", enabled: true, amount: 0.04, animate: true, seed: 1 },
    { id: "dither", type: "stylize", enabled: true, mode: "dither", amount: 1, seed: 7 }
  ]
});

// A slow push through the logo scene.
const camera2d = {
  position: { x: 0, y: 0 }, depthPx: 0, focalLengthPx: 1800,
  keyframes: [
    { timeMs: 0, position: { x: 0, y: 0 }, depthPx: 0 },
    { timeMs: ms(90), position: { x: 0, y: 0 }, depthPx: 0 },
    { timeMs: ms(164), position: { x: 0, y: -10 }, depthPx: 90 },
    { timeMs: ms(165), position: { x: 0, y: 0 }, depthPx: 0 }
  ]
};

const bundle = {
  name: "Kite — Savings on autopilot",
  description: "A 15-second app ad made from motion graphics alone: kinetic type, a drawn-on chart, a filling goal ring, and a logo reveal.",
  fps: FPS,
  width: W,
  height: H,
  durationMs: ms(FRAMES),
  videoUri: "package://nodetool-base/timelines/kite/ad.mp4",
  posterUri: "package://nodetool-base/timelines/kite/poster.jpg",
  document: { tracks, clips, markers: [], camera2d }
};

const out = join(dirname(fileURLToPath(import.meta.url)), "../../packages/base-nodes/nodetool/examples/timelines/kite.timeline.json");
writeFileSync(out, `${JSON.stringify(bundle)}\n`);
console.log(`${clips.length} clips, ${tracks.length} tracks -> ${out}`);
