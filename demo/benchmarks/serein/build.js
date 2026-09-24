// Serein launch film: the complete build.
//
// `node demo/benchmarks/serein/build.js` generates the whole timeline document
// as demo/out/serein-doc.json. Upload it with the `upload_asset` MCP tool, then
// write it with `execute_code`:
//
//   import { set_timeline_document } from "@nodetool-ai/sandbox-nodetool/timelines";
//   const doc = JSON.parse(await nodetool.assets.read("<asset id>"));
//   return await set_timeline_document({ timeline_id: doc.timeline_id, document: doc.document });
//
// Frames follow BRIEF.md section 4; positions are px from the frame centre.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TIMELINE_ID = "1336a629714e";

const W = 1920, H = 1080;
const ms = (f) => Math.floor((f * 1000) / 30);
const rad = (d) => (d * Math.PI) / 180;
const beatFrame = (k) => Math.round((8.15 + (k * 60) / 136) * 30);

const INK = "#0a0f1f", INK2 = "#1e1b4b", CARD = "#111a2e", LINE = "rgba(148,163,184,0.18)";
const TEXT = "#f8fafc", DIM = "#94a3b8", VIOLET = "#a78bfa";
const NOW = "#fda4af", LATER = "#93c5fd", NEVER = "#64748b", CALM = "#0f3b3a";
const DUSK = { type: "linear", angle: 0, stops: [{ offset: 0, color: "#60a5fa" }, { offset: 0.5, color: "#a78bfa" }, { offset: 1, color: "#fda4af" }] };
const CAT = { Now: "rgba(253,164,175,0.7)", Later: "rgba(147,197,253,0.7)", Never: "rgba(100,116,139,0.7)" };
const CAT_SOLID = { Now: NOW, Later: LATER, Never: NEVER };

const EMAILS = [
  ["Maya Chen", "Contract renewal: need your sign-off", "Now", "9:41"],
  ["Billing", "Your invoice #4471 is ready", "Later", "9:38"],
  ["Jonas Weber", "Re: re: re: offsite dates", "Later", "9:32"],
  ["Calendar", "Updated: Weekly sync (moved)", "Never", "9:30"],
  ["Priya Nair", "Draft deck for Thursday", "Later", "9:21"],
  ["GitHub", "14 new notifications", "Later", "9:17"],
  ["Newsletter", "12 tools you missed this week", "Never", "9:05"],
  ["Leo Martins", "Quick question about the budget", "Later", "8:58"],
  ["Flights", "Check in now for your trip", "Now", "8:44"],
  ["HR", "Benefits enrollment closes Friday", "Later", "8:40"],
  ["Sam Ortiz", "Photos from Saturday", "Later", "8:31"],
  ["Security", "New sign-in on a new device", "Now", "8:22"],
  ["Ana Silva", "Can you review by EOD?", "Now", "8:15"],
  ["Store", "Your order has shipped", "Never", "8:02"],
  ["Recruiting", "Candidate feedback needed", "Later", "7:56"],
  ["Team", "Standup notes", "Never", "7:48"],
  ["Promo", "Last day: 40% off", "Never", "7:30"],
  ["Dad", "Call me when you can", "Now", "7:12"],
].map(([sender, subject, cat, time]) => ({ sender, subject, cat, time }));

const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------------------
// Document plumbing

let idc = 0;
const nid = (p) => `${p}${++idc}`;
const scenes = [];
let cur = null;

function scene(name, bank, start, end, extra = {}) {
  const s = { name, bank, start, end, layers: [] };
  s.group = {
    id: name, name, trackId: "t_scenes", startMs: ms(start), durationMs: ms(end + 1) - ms(start),
    mediaType: "group", sourceType: "imported", status: "generated", locked: false, versions: [],
    transform: tf(), ...extra,
  };
  scenes.push(s);
  cur = s;
  return s;
}

function tf(x = 0, y = 0, s = 1, extra = {}) {
  return { position: { x, y }, scale: { x: s, y: s }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, ...extra };
}

/** Adds a clip to the current scene, above everything added before it. */
function add(mediaType, o) {
  const s = cur;
  const from = o.from ?? s.start;
  const to = o.to ?? s.end;
  const clip = {
    id: o.id ?? nid(mediaType[0]), name: o.name ?? o.id ?? mediaType, startMs: ms(from), durationMs: ms(to + 1) - ms(from),
    mediaType, sourceType: "imported", status: "generated", locked: false, versions: [],
    parentId: o.parent ?? s.name, transform: o.transform ?? tf(o.x ?? 0, o.y ?? 0, o.s ?? 1, o.tx ?? {}),
  };
  for (const k of ["shapeStyle", "textStyle", "effects", "animations", "opacity", "blendMode", "layout", "repeater", "motionBlur", "temporalEcho", "animationLinks", "mask"]) {
    if (o[k] !== undefined) clip[k] = o[k];
  }
  clip._z = s.layers.length;
  clip._from = from;
  s.layers.push(clip);
  return clip;
}

const group = (o) => add("group", o);

/** A shape drawn centred in the frame, then placed by its transform (BRIEF.md D6). */
function box(w, h, fill, o = {}) {
  const shape = { kind: o.kind ?? "rect", x: 0.5 - w / 2 / W, y: 0.5 - h / 2 / H, width: w / W, height: h / H, cornerRadius: (o.r ?? 0) / W };
  if (typeof fill === "string") shape.fill = fill; else if (fill) shape.fillStyle = fill;
  if (o.stroke) { shape.stroke = o.stroke; shape.strokeWidthPx = o.sw ?? 1; }
  Object.assign(shape, o.shape ?? {});
  return add("shape", { ...o, shapeStyle: shape });
}
const ellipse = (d, fill, o = {}) => box(d, d, fill, { ...o, kind: "ellipse" });

/**
 * A text clip. `anchor` "left" puts the block's left edge at x, "right" its
 * right edge, "center" its centre (BRIEF.md D11).
 */
function text(str, size, weight, color, o = {}) {
  const anchor = o.anchor ?? "center";
  const mw = o.mw ?? 0.9;
  const x0 = o.x ?? 0;
  const x = anchor === "left" ? x0 + (mw * W) / 2 : anchor === "right" ? x0 - (mw * W) / 2 : x0;
  const style = { text: str, fontFamily: "Inter", fontSizePx: size, fontWeight: weight, color, align: anchor, maxWidthFrac: mw, ...(o.style ?? {}) };
  if (o.tracking) style.letterSpacingPx = o.tracking * size;
  if (o.fill) style.fill = o.fill;
  return add("text", { ...o, x, textStyle: style });
}

// Animations. `f0` counts from the clip's own start frame.
function anim(clipFrom, f0, dur, curves, opts = {}) {
  const delayMs = ms(clipFrom + f0) - ms(clipFrom);
  const durationMs = Math.max(1, ms(clipFrom + f0 + dur) - ms(clipFrom + f0));
  return { id: nid("a"), role: "in", preset: "custom", delayMs, durationMs, custom: { curves }, ...opts };
}
const cv = (property, a, b, easing = "easeOutExpo") => ({ property, keyframes: [{ t: 0, value: a }, { t: 1, value: b, easing }] });
const kfs = (property, list) => ({ property, keyframes: list.map(([t, value, easing]) => (easing ? { t, value, easing } : { t, value })) });
const NOOP = cv("opacity", 1, 1, "linear");

/** Shorthand: one animation on `clip` at scene frame f0. */
function on(clip, f0, dur, curves, opts) {
  const a = anim(clip._from, f0 - (clip._from - cur.start), dur, curves, opts);
  clip.animations = [...(clip.animations ?? []), a];
  return clip;
}

// ---------------------------------------------------------------------------
// Shared parts

function backdrop(colorB = INK2, opacity = 0.6, seed = 3) {
  box(W, H, INK, { name: "ink" });
  return box(W, H, INK, {
    name: "field", opacity,
    effects: [{ id: "gf", type: "generator", enabled: true, mode: "gradientField", colorA: INK, colorB, scale: 4, animate: true, seed }],
  });
}

function glow(size = 900, alpha = 0.25, o = {}) {
  return ellipse(size, { type: "radial", stops: [{ offset: 0, color: `rgba(167,139,250,${alpha})` }, { offset: 0.35, color: `rgba(167,139,250,${alpha * 0.45})` }, { offset: 0.7071, color: "rgba(167,139,250,0)" }] }, { name: "glow", ...o });
}

function flash(f0, dur, peak) {
  const c = box(W, H, "#ffffff", { name: "flash", from: cur.start + f0, to: Math.min(cur.end, cur.start + f0 + dur), blendMode: "screen" });
  return on(c, f0, dur, [cv("opacity", peak, 0, "linear")]);
}

/** The email card: a rect, an avatar, sender, subject, time. Local coordinates are px from the card centre. */
function emailCard(e, cx, cy, o = {}) {
  const parent = o.parent;
  const depth = o.depth;
  const t = (x, y) => tf(cx + x, cy + y, 1, depth !== undefined ? { depthPx: depth } : {});
  const out = [];
  out.push(box(420, 88, CARD, { parent, r: 18, stroke: LINE, sw: 1, transform: t(0, 0), effects: o.shadow === false ? undefined : [{ id: "sh", type: "dropShadow", enabled: true, offsetX: 0, offsetY: 12, blur: 36, color: "rgba(0,0,0,0.45)" }] }));
  if (o.unread) out.push(ellipse(8, LATER, { parent, transform: t(-199, 0) }));
  out.push(ellipse(36, CAT[e.cat], { parent, transform: t(-172, 0) }));
  out.push(text(e.sender, 20, 600, TEXT, { parent, anchor: "left", mw: 0.3, x: cx - 138, transform: undefined, y: cy - 12 }));
  out.push(text(e.subject, 18, 400, DIM, { parent, anchor: "left", mw: 0.3, x: cx - 138, y: cy + 13 }));
  out.push(text(e.time, 16, 400, DIM, { parent, anchor: "right", mw: 0.2, x: cx + 190, y: cy - 12 }));
  if (depth !== undefined) for (const c of out) if (c.mediaType === "text") c.transform.depthPx = depth;
  return out;
}

/** The Serein mark at (x, y). `f0` null draws it complete. */
function mark(x, y, f0, parent) {
  const g = group({ name: "mark", parent, x, y, effects: [{ id: "mglow", type: "glow", enabled: true, radius: 40, intensity: 0.8, color: VIOLET }] });
  const ring = ellipse(114, null, { parent: g.id, stroke: TEXT, sw: 6, shape: { lineCap: "round" } });
  const horizon = add("shape", {
    parent: g.id, transform: tf(0, 19),
    shapeStyle: { kind: "line", x: 0.5 - 75 / W, y: 0.5, x2: 0.5 + 75 / W, y2: 0.5, stroke: TEXT, strokeWidthPx: 6, lineCap: "round" },
  });
  const sun = ellipse(44, DUSK, { parent: g.id, transform: tf(0, -8) });
  if (f0 !== null) {
    on(ring, f0, 16, [cv("trimEnd", 0, 1)]);
    on(horizon, f0 + 6, 14, [cv("trimEnd", 0, 1)]);
    on(sun, f0 + 12, 16, [cv("scale", 0.6, 1, "spring(170,18,1)")]);
    on(sun, f0 + 12, 4, [cv("opacity", 0, 1, "linear")]);
  }
  return g;
}

function wordmark(x, y, f0, parent) {
  const w = text("Serein", 140, 800, TEXT, { parent, x, y, tracking: -0.035 });
  if (f0 !== null) {
    on(w, f0, 12, [cv("offsetY", 40, 0), cv("opacity", 0, 1)], { stagger: { unit: "character", offsetMs: 30 } });
  }
  return w;
}

function labels(kicker, headline) {
  if (headline) box(W, H, { type: "linear", angle: 90, stops: [{ offset: 0, color: "rgba(10,15,31,0)" }, { offset: 0.55, color: "rgba(10,15,31,0)" }, { offset: 1, color: "rgba(10,15,31,0.85)" }] }, { name: "scrim" });
  const k = text(kicker.toUpperCase(), 24, 600, DIM, { name: "kicker", anchor: "left", mw: 0.5, x: 96 - W / 2, y: 110 - H / 2, style: { letterSpacingPx: 4 } });
  on(k, 4, 10, [cv("wipeProgress", 0, 1), cv("opacity", 0, 1)]);
  k.animations[0].custom.mask = { direction: "left", softness: 0.05 };
  if (headline) {
    const h = text(headline, 72, 800, TEXT, { name: "headline", anchor: "left", mw: 0.8, x: 96 - W / 2, y: 418, tracking: -0.03 });
    on(h, 10, 12, [cv("offsetY", 30, 0), cv("opacity", 0, 1)], { stagger: { unit: "word", offsetMs: 60 } });
  }
}

// ---------------------------------------------------------------------------
// The card wall (S1, reused dimmed in S5)

function layerCards(n, cols, y0, span, seed) {
  return Array.from({ length: n }, (_, k) => ({
    x: cols[(k * 3 + seed) % cols.length] * 460 + (hash(seed * 50 + k) - 0.5) * 60,
    y: y0 + (k / n) * span + (hash(seed * 70 + k) - 0.5) * 80,
  }));
}
const FAR = layerCards(9, [-2, 0, 2, -1, 1], -640, 1950, 1).map((c, k) => ({ ...c, email: k }));
const MID = layerCards(7, [-1, 1, 0, -2, 2], -560, 1900, 2).map((c, k) => ({ ...c, x: c.x + 230, email: 9 + k }));
const NEAR = layerCards(5, [-1, 1, 0], -380, 1700, 3).map((c, k) => ({ ...c, x: c.x - 115, email: (16 + k) % 18 }));

/** `scroll(f)` gives the mid-layer offset at scene frame f (px, positive = up). */
function wall(o) {
  const w = group({ name: "wall", opacity: o.opacity, effects: o.effects, transform: tf(0, 0, 1, { rotation: rad(-12), rotationX: 28, perspective: 1800 }) });
  const len = cur.end - cur.start;
  const scrollCurve = (speed) => kfs("offsetY", o.scrollKeys.map(([f, v]) => [f / len, -v * speed]));
  const layer = (name, speed, opacity) => {
    const g = group({ name, parent: w.id, opacity });
    on(g, 0, len, [scrollCurve(speed)]);
    if (o.wiggle) on(g, 0, len, o.wiggle);
    return g;
  };
  const skel = layer("skeleton", 0.8, 0.6);
  for (let col = 0; col < 5; col++) {
    const x = (col - 2) * 460 + 230;
    const y = -700 + (col % 2) * 125;
    const rep = { count: 8, positionStep: { x: 0, y: 250 }, timeStepMs: 0, colorStep: { hueDegrees: 0, brightness: -0.01 } };
    box(420, 88, CARD, { parent: skel.id, r: 18, stroke: LINE, transform: tf(x, y, 1, { depthPx: -340 }), repeater: rep });
    box(150, 12, "rgba(148,163,184,0.2)", { parent: skel.id, r: 6, transform: tf(x - 210 + 72 + 75, y - 10, 1, { depthPx: -340 }), repeater: rep });
    box(240, 10, "rgba(148,163,184,0.12)", { parent: skel.id, r: 5, transform: tf(x - 210 + 72 + 120, y + 11, 1, { depthPx: -340 }), repeater: rep });
  }
  const far = layer("far", 0.85, 0.5);
  for (const c of FAR) emailCard(EMAILS[c.email], c.x, c.y, { parent: far.id, depth: -300, unread: o.unread, shadow: false });
  const mid = layer("mid", 1, 1);
  for (const c of MID) emailCard(EMAILS[c.email], c.x, c.y, { parent: mid.id, depth: 0, unread: o.unread });
  const near = layer("near", 1.19, 1);
  for (const c of NEAR) emailCard(EMAILS[c.email], c.x, c.y, { parent: near.id, depth: 220, unread: o.unread });
  return w;
}

// ---------------------------------------------------------------------------
// S1 The flood (0–122)

function buildS1() {
  scene("S1", "A", 0, 122);
  backdrop(INK2, 0.6);
  const v = 700 / 148;
  // Wiggle grows 0 → 6 px over frames 96–122: a wiggle link has a fixed amplitude, so it is baked as curves.
  const wx = [], wy = [];
  for (let f = 0; f <= 122; f++) {
    const a = f < 96 ? 0 : (6 * (f - 96)) / 26;
    wx.push([f / 122, a * (Math.sin(f * 1.7) + Math.sin(f * 2.9 + 1)) * 0.5]);
    wy.push([f / 122, a * (Math.sin(f * 2.3 + 2) + Math.sin(f * 3.7)) * 0.5]);
  }
  wall({ unread: true, scrollKeys: [[0, 0], [96, v * 96], [122, v * 148]], wiggle: [kfs("offsetX", wx), kfs("offsetY", wy)] });
  glow(1500, 0, { name: "counter-scrim" }).shapeStyle.fillStyle = { type: "radial", stops: [{ offset: 0, color: "rgba(10,15,31,0.75)" }, { offset: 0.35, color: "rgba(10,15,31,0.45)" }, { offset: 0.7071, color: "rgba(10,15,31,0)" }] };
  const enter = (c) => on(c, 8, 12, [cv("opacity", 0, 1), cv("blur", 30, 0)]);
  enter(text("You have", 48, 400, DIM, { y: -190, tracking: -0.01 }));
  const num = text("0", 300, 800, TEXT, {
    name: "counter", y: 0, tracking: -0.045,
    effects: [{ id: "gl", type: "stylize", enabled: true, mode: "glitch", amount: 0, seed: 5, animate: true }],
  });
  enter(num);
  // BRIEF.md asks for easeInExpo, but checkpoint C1 wants "near 300" at frame 40; an ease-in quad meets C1.
  on(num, 12, 88, [NOOP], { textAnimator: { kind: "ticker", from: 0, to: 2847, groupSeparator: "," }, easing: "cubic-bezier(0.55,0.085,0.68,0.53)" });
  on(num, 96, 26, [NOOP], { styleTracks: [{ target: "effect.gl.amount", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 0.5 }] }] });
  enter(text("unread emails.", 48, 400, DIM, { y: 190, tracking: -0.01 }));
  const split = add("adjustment", { name: "rgbsplit", effects: [{ id: "rgb", type: "stylize", enabled: true, mode: "rgbSplit", amount: 0 }] });
  on(split, 96, 26, [NOOP], { styleTracks: [{ target: "effect.rgb.amount", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 0.4 }] }] });
}

// ---------------------------------------------------------------------------
// S2 The name (123–191)

const LOGO = { markX: -221, wordX: 76 };

function buildS2() {
  const s = scene("S2", "B", 123, 191);
  s.group.animations = [anim(s.start, 61, 7, [cv("opacity", 1, 0, "linear")])];
  box(W, H, INK, { name: "ink" });
  glow(900, 0.25);
  const row = group({ name: "logo", y: -30 });
  mark(LOGO.markX, 0, 0, row.id);
  wordmark(LOGO.wordX, 0, 8, row.id);
  const tag = text("The inbox that sorts itself.", 44, 400, DIM, { y: 110, tracking: -0.01 });
  on(tag, 30, 12, [cv("opacity", 0, 1), cv("offsetY", 20, 0)]);
  flash(0, 10, 0.9);
}

// ---------------------------------------------------------------------------
// S3 One email (192–244)

function buildS3() {
  scene("S3", "A", 192, 244);
  backdrop(INK2, 0.3, 4);
  const card = group({ name: "big-card" });
  on(card, 0, 10, [cv("opacity", 0, 1), cv("offsetY", 24, 0)]);
  on(card, 0, 52, [cv("scale", 1, 1.04, "linear")]);
  on(card, 36, 16, [cv("scale", 1, 1.08 / 1.04)]);
  const r = box(1100, 220, CARD, { parent: card.id, r: 28, stroke: LINE, effects: [{ id: "sh", type: "dropShadow", enabled: true, offsetX: 0, offsetY: 12, blur: 36, color: "rgba(0,0,0,0.45)" }] });
  on(r, 36, 16, [NOOP], { styleTracks: [{ target: "effect.sh.offsetY", keyframes: [{ t: 0, value: 12 }, { t: 1, value: 40, easing: "easeOutExpo" }] }] });
  ellipse(64, CAT.Now, { parent: card.id, x: -482, y: -42 });
  text("Maya Chen", 34, 600, TEXT, { parent: card.id, anchor: "left", mw: 0.5, x: -430, y: -58 });
  const subj = text(EMAILS[0].subject, 30, 400, TEXT, { parent: card.id, anchor: "left", mw: 0.5, x: -430, y: -16 });
  on(subj, 4, 24, [NOOP], { textAnimator: { kind: "scramble", seed: 3 } });
  text("9:41", 26, 400, DIM, { parent: card.id, anchor: "right", mw: 0.2, x: 514, y: -58 });
  box(760, 14, "rgba(148,163,184,0.2)", { parent: card.id, r: 7, x: -50, y: 43 });
  box(520, 14, "rgba(148,163,184,0.2)", { parent: card.id, r: 7, x: -170, y: 73 });
  // The chip: right edge on the card's right edge, 40 px below the card.
  const chip = group({ name: "chip", parent: card.id, y: 110 + 40 + 25 });
  on(chip, 8, 12, [cv("opacity", 0, 1), cv("offsetY", 14, 0)]);
  const reading = text("Serein is reading…", 22, 600, DIM, { parent: chip.id, anchor: "right", mw: 0.3, x: 550 - 24, y: 0, to: 192 + 43 });
  reading.animations = [anim(reading._from, 0, 16, [NOOP], { role: "loop", styleTracks: [{ target: "text.color", keyframes: [{ t: 0, value: DIM }, { t: 0.5, value: VIOLET, easing: "easeInOut" }, { t: 1, value: DIM, easing: "easeInOut" }] }] })];
  on(reading, 36, 8, [cv("opacity", 1, 0, "linear")]);
  const sorted = text("Sorted → Now", 22, 600, NOW, { parent: chip.id, anchor: "right", mw: 0.3, x: 550 - 24, y: 0, from: 192 + 36 });
  on(sorted, 36, 8, [cv("opacity", 0, 1, "linear")]);
  const pill = box(250, 48, CARD, { parent: chip.id, r: 24, stroke: LINE, x: 550 - 125 + 24, layout: { kind: "relative", targetClipId: reading.id, side: "center", fitText: { paddingXPx: 56, paddingYPx: 12 } } });
  pill._z = reading._z - 0.5;
  const spin = ellipse(20, null, { parent: chip.id, stroke: VIOLET, sw: 2.5, shape: { trimStart: 0.1, trimEnd: 0.35, lineCap: "round" }, to: 192 + 43, layout: { kind: "relative", targetClipId: reading.id, side: "left", gapPx: 12 } });
  spin.animations = [anim(spin._from, 0, 20, [cv("rotation", 0, rad(-360), "linear")], { role: "loop" })];
  on(spin, 36, 8, [cv("opacity", 1, 0, "linear")]);
  const dot = ellipse(10, NOW, { parent: chip.id, from: 192 + 36, layout: { kind: "relative", targetClipId: sorted.id, side: "left", gapPx: 12 } });
  on(dot, 36, 8, [cv("opacity", 0, 1, "linear")]);
}

// ---------------------------------------------------------------------------
// S4 labels are built per scene. S4a Sort (245–349, runs to 357 under the whip)

function buildS4a() {
  scene("S4a", "A", 245, 357);
  backdrop(INK2, 0.35, 5);
  const board = group({ name: "board", y: -50, s: 0.88, tx: { rotationX: 18, rotationY: -10, perspective: 2400 } });
  on(board, 0, 105, [cv("rotationY", 0, 6, "linear")]);
  const colX = { Now: -520, Later: 0, Never: 520 };
  const byCat = { Now: [], Later: [], Never: [] };
  EMAILS.forEach((e, i) => byCat[e.cat].push(i));
  const order = [];
  for (let j = 0; j < 8; j++) for (const c of ["Now", "Later", "Never"]) if (j < byCat[c].length) order.push({ email: byCat[c][j], cat: c, slot: j });
  const landed = { Now: [], Later: [], Never: [] };
  order.forEach((o, k) => {
    const start = 6 + k * 1.2;
    const sx = (hash(k * 5 + 1) * 2 - 1) * 900, sy = (hash(k * 5 + 2) * 2 - 1) * 600, rot = (hash(k * 5 + 3) * 2 - 1) * 25;
    const x = colX[o.cat], y = -240 + o.slot * 104;
    const g = group({ name: `fly-${k}`, parent: board.id, x, y });
    const f0 = Math.floor(start);
    on(g, f0, 15, [cv("offsetX", sx - x, 0, "spring(170,18,1)"), cv("offsetY", sy - y, 0, "spring(170,18,1)"), cv("rotation", rad(-rot), 0, "spring(170,18,1)"), cv("scale", 0.7, 1, "spring(170,18,1)")]);
    on(g, f0, 4, [cv("opacity", 0, 1, "linear")]);
    emailCard(EMAILS[o.email], 0, 0, { parent: g.id });
    landed[o.cat].push(f0 + 10);
  });
  for (const c of ["Now", "Later", "Never"]) {
    const h = group({ name: `head-${c}`, parent: board.id, x: colX[c], y: -330 });
    on(h, 2, 10, [cv("opacity", 0, 1)]);
    for (const k of [4, 6]) h.animations.push({ id: nid("a"), role: "emphasis", preset: "pulse", durationMs: ms(8), beat: { index: k + 1, scope: "sequence" }, params: { intensity: 0.06 } });
    const first = landed[c][0], last = landed[c][landed[c].length - 1];
    const label = text(`${c}  0`, 24, 600, TEXT, { parent: h.id, x: 10, y: 0 });
    on(label, first, Math.max(1, last - first), [NOOP], { textAnimator: { kind: "ticker", from: 0, to: landed[c].length, prefix: `${c}  ` } });
    const pill = box(170, 50, CARD, { parent: h.id, r: 25, stroke: LINE, layout: { kind: "relative", targetClipId: label.id, side: "center", fitText: { paddingXPx: 38, paddingYPx: 12 } } });
    pill._z = label._z - 0.5;
    const dot = ellipse(12, CAT_SOLID[c], { parent: h.id, layout: { kind: "relative", targetClipId: label.id, side: "left", gapPx: 12 }, effects: [{ id: "dg", type: "glow", enabled: true, radius: 12, intensity: 0.6 }] });
    void dot;
  }
  labels("01 — Sort", "Sorted before you look.");
  flash(0, 8, 0.6);
}

// ---------------------------------------------------------------------------
// S4b Summarize (350–455, runs to 466 under the wipe)

function buildS4b() {
  scene("S4b", "C", 350, 466, { transitionIn: { type: "whip", durationMs: 250, direction: "right", easing: "easeInOut" } });
  backdrop(INK2, 0.35, 6);
  const card = group({ name: "sum-card", x: 160 });
  on(card, 0, 8, [cv("opacity", 0, 1)]);
  const r = box(900, 700, CARD, { parent: card.id, r: 28, stroke: LINE, effects: [{ id: "sh", type: "dropShadow", enabled: true, offsetX: 0, offsetY: 30, blur: 80, color: "rgba(0,0,0,0.5)" }] });
  on(r, 50, 20, [NOOP], { styleTracks: [
    { target: "shape.height", keyframes: [{ t: 0, value: 700 / H }, { t: 1, value: 300 / H, easing: "spring(170,18,1)" }] },
    { target: "shape.y", keyframes: [{ t: 0, value: 0.5 - 350 / H }, { t: 1, value: 0.5 - 150 / H, easing: "spring(170,18,1)" }] },
  ] });
  const top = -350;
  const head = group({ name: "sum-head", parent: card.id });
  on(head, 50, 20, [cv("offsetY", 0, 200, "spring(170,18,1)")]);
  ellipse(48, CAT.Later, { parent: head.id, x: -450 + 64, y: top + 60 });
  text("Priya Nair", 22, 600, DIM, { parent: head.id, anchor: "left", mw: 0.4, x: -342, y: top + 44 });
  text("Q3 planning: notes from Tuesday", 30, 600, TEXT, { parent: head.id, anchor: "left", mw: 0.4, x: -342, y: top + 78 });
  const chipX = 450 - 36 - 75, chipY = top + 60;
  const border = box(152, 42, DUSK, { parent: head.id, r: 21, x: chipX, y: chipY, from: 350 + 56 });
  on(border, 56, 8, [cv("opacity", 0, 1)]);
  box(150, 40, CARD, { parent: head.id, r: 20, stroke: LINE, x: chipX, y: chipY });
  text("6 min read", 20, 600, DIM, { parent: head.id, x: chipX, y: chipY, to: 350 + 55 });
  const fast = text("20 sec read", 20, 600, TEXT, { parent: head.id, x: chipX, y: chipY, from: 350 + 56 });
  on(fast, 56, 8, [NOOP], { textAnimator: { kind: "scramble", seed: 5 } });
  const widths = [780, 700, 820, 610, 760, 690, 800, 540, 740, 660, 780, 420];
  widths.forEach((w, i) => {
    const y = top + 136 + i * 44 + 8;
    const line = box(w, 16, "rgba(148,163,184,0.2)", { parent: card.id, r: 8, x: -410 + w / 2, y, to: 350 + 52 });
    on(line, 4 + Math.round(i * 1.2), 10, [cv("opacity", 0, 1), cv("offsetY", -16, 0)]);
    on(line, 30 + Math.round(((y - top - 118) / 572) * 20) - 1, 5, [cv("scaleY", 1, 0, "easeOut")]);
  });
  const bar = box(900, 4, DUSK, { parent: card.id, x: 0, y: top + 118, from: 350 + 30, to: 350 + 52, effects: [{ id: "bg", type: "glow", enabled: true, radius: 24, intensity: 1, color: VIOLET }] });
  on(bar, 30, 20, [cv("offsetY", 0, 572, "easeInOut")]);
  on(bar, 48, 4, [cv("opacity", 1, 0, "linear")]);
  ["Launch moves to Nov 12", "Budget approved, +8%", "You own the pricing page"].forEach((b, i) => {
    const f0 = 52 + Math.round(i * 4.5);
    const y = -150 + 128 + i * 50 + 14;
    const d = ellipse(10, DUSK, { parent: card.id, x: -405, y, from: 350 + f0 });
    on(d, f0, 4, [cv("opacity", 0, 1)]);
    const t = text(b, 28, 400, TEXT, { parent: card.id, anchor: "left", mw: 0.4, x: -382, y, from: 350 + f0 });
    t.animations = [{ id: nid("a"), role: "in", preset: "wipe", durationMs: 300, params: { direction: "left", softness: 0.05 }, easing: "easeOutExpo" }];
  });
  labels("02 — Summarize", "The gist, in three lines.");
}

// ---------------------------------------------------------------------------
// S4c Reply (456–561, runs to 570 under the iris)

function buildS4c() {
  scene("S4c", "B", 456, 570, { transitionIn: { type: "gradientWipe", durationMs: 350, direction: "left", map: "noise", seed: 4, easing: "easeInOutExpo" } });
  backdrop(INK2, 0.35, 7);
  const comp = group({ name: "composer", x: 140 });
  on(comp, 0, 10, [cv("opacity", 0, 1), cv("offsetY", 20, 0)]);
  on(comp, 70, 16, [cv("opacity", 1, 0, "easeInOut"), cv("offsetY", 0, 40, "easeInOut")]);
  box(1000, 460, CARD, { parent: comp.id, r: 28, stroke: LINE, effects: [{ id: "sh", type: "dropShadow", enabled: true, offsetX: 0, offsetY: 30, blur: 80, color: "rgba(0,0,0,0.5)" }] });
  text("To: Maya Chen", 22, 600, DIM, { parent: comp.id, anchor: "left", mw: 0.4, x: -456, y: -183 });
  box(912, 1, LINE, { parent: comp.id, y: -148 });
  const body = text("Signed. Thanks for chasing this. Sending the countersigned copy now.", 36, 400, TEXT, { parent: comp.id, anchor: "left", mw: 900 / W, x: -456, y: -70, tracking: -0.01, style: { lineHeight: 1.4 } });
  body.animations = [{ id: nid("a"), role: "in", preset: "typewriter", durationMs: 1400, delayMs: ms(456 + 8) - ms(456), caret: { color: VIOLET, widthPx: 3, blinkPeriodMs: 533 } }];
  // Tone chips: a row layout of the three labels, each pill fitted to its label.
  const tones = ["Formal", "Brief", "Warm"].map((t) => text(t, 22, 600, DIM, { parent: comp.id, x: 0, y: 64 }));
  group({ name: "tone-row", parent: comp.id, x: -300, y: 64, layout: { kind: "row", children: tones.map((t) => t.id), gapPx: 56 } });
  const sel = box(116, 48, "rgba(167,139,250,0.25)", { parent: comp.id, r: 24, stroke: "rgba(167,139,250,0.45)", x: -398, y: 64 });
  sel._z = tones[0]._z - 0.6;
  on(sel, 14, 20, [cv("offsetX", 0, 237, "spring(170,18,1)"), cv("scaleX", 1, 106 / 116, "spring(170,18,1)")]);
  for (const t of tones) {
    const p = box(110, 48, null, { parent: comp.id, r: 24, stroke: LINE, layout: { kind: "relative", targetClipId: t.id, side: "center", fitText: { paddingXPx: 22, paddingYPx: 12 } } });
    p._z = t._z - 0.4;
  }
  const send = group({ name: "send", parent: comp.id, x: 385, y: 158 });
  on(send, 64, 3, [cv("scale", 1, 0.94, "easeOut")]);
  on(send, 67, 15, [cv("scale", 1, 1 / 0.94, "spring(170,18,1)")]);
  box(150, 64, DUSK, { parent: send.id, r: 32, effects: [{ id: "sg", type: "dropShadow", enabled: true, offsetX: 0, offsetY: 12, blur: 36, color: "rgba(167,139,250,0.35)" }] });
  text("Send", 24, 600, INK, { parent: send.id });
  // The paper plane: an SVG path nose-right, flown along a curve with orient.
  const px = (v) => (960 - 30 + v) / W, py = (v) => (540 - 22 + v) / H;
  const plane = add("shape", {
    name: "plane", from: 456 + 64, to: 456 + 90,
    shapeStyle: { kind: "path", d: `M${px(0)} ${py(0)} L${px(60)} ${py(22)} L${px(0)} ${py(44)} L${px(14)} ${py(22)} Z`, fill: TEXT },
    motionBlur: { samplesPerFrame: 8, shutterAngle: 180 },
    temporalEcho: { copies: 6, intervalMs: 50, opacityDecay: 0.6 },
  });
  const sx = 960 + 140 + 385, sy = 540 + 158;
  const path = `M${sx / W} ${sy / H} C${(sx + 160) / W} ${(sy - 40) / H} ${(sx + 260) / W} ${(sy - 420) / H} ${2150 / W} ${-220 / H}`;
  plane.animations = [{ id: nid("a"), role: "emphasis", preset: "followPath", durationMs: ms(22), easing: "easeInOut", params: { d: path, pathX: 0, pathY: 0, pathWidth: 1, pathHeight: 1, orient: true } }];
  // BRIEF.md puts the toast at 76–88, but checkpoint C11 (frame 530 = local 74) wants it entering.
  const toast = group({ name: "toast", y: -390 });
  on(toast, 72, 12, [cv("opacity", 0, 1), cv("offsetY", -24, 0)]);
  const tt = text("Sent · 0.4 s", 24, 600, TEXT, { parent: toast.id, x: 12 });
  const tp = box(230, 56, CARD, { parent: toast.id, r: 28, stroke: LINE, layout: { kind: "relative", targetClipId: tt.id, side: "center", fitText: { paddingXPx: 44, paddingYPx: 14 } }, effects: [{ id: "tsh", type: "dropShadow", enabled: true, offsetX: 0, offsetY: 10, blur: 30, color: "rgba(0,0,0,0.35)" }] });
  tp._z = tt._z - 0.5;
  ellipse(12, DUSK, { parent: toast.id, layout: { kind: "relative", targetClipId: tt.id, side: "left", gapPx: 12 } });
  labels("03 — Reply", "Drafts in your voice.");
}

// ---------------------------------------------------------------------------
// S4d Inbox zero (562–614)

function buildS4d() {
  scene("S4d", "A", 562, 614, { transitionIn: { type: "iris", durationMs: 300, softness: 0.05, easing: "easeInOut" } });
  const field = backdrop(INK2, 0.85, 8);
  on(field, 30, 22, [NOOP], { styleTracks: [{ target: "effect.gf.colorB", keyframes: [{ t: 0, value: INK2 }, { t: 1, value: CALM, easing: "easeOut" }] }] });
  const count = text("0", 320, 800, TEXT, { name: "countdown", y: -40, tracking: -0.045, to: 562 + 37 });
  on(count, 0, 38, [NOOP], { textAnimator: { kind: "ticker", from: 2847, to: 0, groupSeparator: "," }, easing: "easeInOutExpo" });
  const zero = text("0", 320, 800, TEXT, { name: "zero", y: -40, tracking: -0.045, fill: DUSK, from: 562 + 38 });
  on(zero, 38, 7, [cv("scale", 1.4, 1), cv("blur", 30, 0)]);
  const burst = box(W, H, null, { name: "particles", from: 562 + 38, to: 562 + 52, blendMode: "screen", effects: [{ id: "pt", type: "generator", enabled: true, mode: "particles", colorA: "#60a5fa", colorB: "#fda4af", seed: 9, animate: true, amount: 1 }] });
  on(burst, 38, 14, [cv("opacity", 1, 0, "easeIn")]);
  const sub = text("Inbox zero. Every morning.", 48, 600, TEXT, { y: 170, tracking: -0.01 });
  on(sub, 40, 12, [cv("opacity", 0, 1), cv("offsetY", 20, 0)]);
  labels("04 — Zero", null);
}

// ---------------------------------------------------------------------------
// S5 Promise (615–667): two word cards joined by a glitch around 642

function wordCard(word, dusk, lead) {
  const len = cur.end - cur.start;
  box(W, H, INK, { name: "ink" });
  wall({ unread: false, opacity: 0.22, effects: [{ id: "wb", type: "blur", enabled: true, radius: 60 }], scrollKeys: [[0, 300 + lead * 1.4], [len, 300 + (lead + len) * 1.4]] });
  add("adjustment", { name: "vignette", effects: [{ id: "vg", type: "vignette", enabled: true, amount: 0.8, softness: 0.6 }] });
  const f0 = lead;
  const w = text(word, 200, 800, TEXT, { name: "word", tracking: -0.045, fill: dusk ? DUSK : undefined, from: cur.start + f0, style: { lineHeight: 1.02 } });
  // The word shows at half opacity on the cut frame, so the cut stays detectable (see the reference build).
  on(w, f0, 1, [cv("opacity", 0.5, 1, "linear")]);
  on(w, f0, 7, [cv("scale", 1.45, 1), cv("blur", 42, 0)]);
  flash(f0, 3, 0.2);
}

function buildS5() {
  scene("S5a", "B", 615, 644);
  wordCard("Private by design.", false, 0);
  scene("S5b", "A", 640, 667, { transitionIn: { type: "glitch", durationMs: 150, amount: 1 } });
  wordCard("Runs on-device.", true, 2);
}

// ---------------------------------------------------------------------------
// S6 End card (668–779)

function buildS6() {
  const s = scene("S6", "B", 668, 779);
  s.group.animations = [anim(s.start, 97, 14, [cv("opacity", 1, 0, "linear")])];
  backdrop(CALM, 0.85, 9);
  glow(1100, 0.25);
  const logo = group({ name: "end-logo", y: -106 });
  on(logo, 0, 20, [cv("scale", 1.2, 1, "spring(170,18,1)")]);
  on(logo, 0, 6, [cv("opacity", 0, 1, "linear")]);
  mark(LOGO.markX, 0, null, logo.id);
  wordmark(LOGO.wordX, 0, null, logo.id);
  const tag = text("The inbox that sorts itself.", 56, 600, TEXT, { y: 38, tracking: -0.01, fill: DUSK });
  on(tag, 10, 14, [cv("opacity", 0, 1), cv("offsetY", 20, 0)]);
  const cta = group({ name: "cta", y: 143 });
  on(cta, 20, 14, [cv("opacity", 0, 1), cv("offsetY", 20, 0)]);
  const ct = text("Early access · Mac & iPhone", 30, 400, TEXT, { parent: cta.id });
  const cp = box(430, 68, "rgba(10,15,31,0.35)", { parent: cta.id, r: 34, stroke: "rgba(248,250,252,0.3)", layout: { kind: "relative", targetClipId: ct.id, side: "center", fitText: { paddingXPx: 36, paddingYPx: 16 } } });
  cp._z = ct._z - 0.5;
  const leak = box(W, H, null, { name: "light-leak", to: 668 + 12, blendMode: "screen", effects: [{ id: "lk", type: "generator", enabled: true, mode: "lightLeak", colorA: "#fda4af", colorB: "#a78bfa", seed: 2, animate: true, amount: 1 }] });
  on(leak, 0, 12, [kfs("opacity", [[0, 0], [0.5, 0.55, "easeOut"], [1, 0, "easeIn"]])]);
  flash(0, 10, 0.8);
}

// ---------------------------------------------------------------------------
// Assembly

buildS1(); buildS2(); buildS3(); buildS4a(); buildS4b(); buildS4c(); buildS4d(); buildS5(); buildS6();

const BANKS = ["A", "B", "C"];
const tracks = [{ id: "t_finish", name: "finish", type: "video", index: 0, visible: true, locked: false }, { id: "t_scenes", name: "scenes", type: "video", index: 1, visible: true, locked: false }];
const clips = [];
let offset = 2;
for (const bank of BANKS) {
  const inBank = scenes.filter((s) => s.bank === bank);
  const size = Math.max(...inBank.map((s) => s.layers.length));
  for (let i = 0; i < size; i++) tracks.push({ id: `t_${bank}${i}`, name: `${bank}${i}`, type: "video", index: offset + i, visible: true, locked: false });
  for (const s of inBank) {
    const ordered = [...s.layers].sort((a, b) => a._z - b._z);
    ordered.forEach((clip, i) => {
      clip.trackId = `t_${bank}${size - 1 - i}`;
      delete clip._z; delete clip._from;
      clips.push(clip);
    });
  }
  offset += size;
}
for (const s of scenes) clips.push(s.group);
clips.push({
  id: "finish", name: "grain + dither", trackId: "t_finish", startMs: 0, durationMs: 26000, mediaType: "adjustment", sourceType: "imported", status: "generated", locked: false, versions: [],
  effects: [{ id: "grain", type: "grain", enabled: true, amount: 0.05, animate: true, seed: 1 }, { id: "dither", type: "stylize", enabled: true, mode: "dither", amount: 1, seed: 7 }],
});

const camera2d = {
  position: { x: 0, y: 0 }, depthPx: 0, focalLengthPx: 1800, focusDepthPx: 0, aperturePx: 0,
  keyframes: [
    { timeMs: 0, position: { x: 0, y: 0 }, depthPx: 0, focusDepthPx: 0, aperturePx: 14 },
    { timeMs: ms(122), position: { x: 0, y: 0 }, depthPx: 260, focusDepthPx: 0, aperturePx: 14 },
    { timeMs: ms(123), position: { x: 0, y: 0 }, depthPx: 0, focusDepthPx: 0, aperturePx: 0 },
  ],
};

const document = { tracks, clips, markers: [], camera2d, tempo: { bpm: 136, offsetMs: 8150, timeSignature: { beatsPerBar: 4, beatUnit: 4 } } };
const outDir = join(dirname(fileURLToPath(import.meta.url)), "../../out");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "serein-doc.json"), JSON.stringify({ timeline_id: TIMELINE_ID, document }));
console.log(`${clips.length} clips, ${tracks.length} tracks -> ${join(outDir, "serein-doc.json")}`);
