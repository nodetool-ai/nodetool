// Serein: a 26-second product launch film for a fictional email app that
// sorts itself. Ported from the original hand-written document builder
// (demo/benchmarks/serein/build.js, see demo/benchmarks/serein/BRIEF.md) onto
// @nodetool-ai/sandbox-timeline so it ships with embedded builder code like
// the other shipped examples.
//
// `node scripts/example-timelines/build.mjs serein` writes the shipped bundle
// packages/base-nodes/nodetool/examples/timelines/serein.timeline.json.
//
// Every time value below is seconds, local to the scene that authored it —
// `v.series()` is the only place a scene's position in the whole video is
// decided. Positions are px from the frame centre. `f(frames)` converts a
// frame count from the original 30fps cut brief into seconds.
import { video, rad, hash } from "@nodetool-ai/sandbox-timeline";

const W = 1920, H = 1080, FPS = 30;
const f = (frames) => frames / FPS;
const msAbs = (frames) => Math.round((frames * 1000) / FPS);
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
  ["Dad", "Call me when you can", "Now", "7:12"]
].map(([sender, subject, cat, time]) => ({ sender, subject, cat, time }));

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: INK, ink2: INK2, text: TEXT, dim: DIM, accent: VIOLET },
  fonts: { display: "Inter", body: "Inter" }
});

// ---------------------------------------------------------------------------
// Shared parts

/** The email card: a rect, an avatar, sender, subject, time — BRIEF.md §5. */
function emailCard(s, e, o = {}) {
  const g = s.group({ name: "email", parent: o.parent, x: o.x ?? 0, y: o.y ?? 0, tx: o.depth !== undefined ? { depthPx: o.depth } : {} });
  s.rect(420, 88, CARD, { parent: g.id, r: 18, stroke: LINE, sw: 1, effects: o.shadow === false ? undefined : [{ type: "dropShadow", offsetX: 0, offsetY: 12, blur: 36, color: "rgba(0,0,0,0.45)" }] });
  if (o.unread) s.ellipse(8, LATER, { parent: g.id, x: -199 });
  s.ellipse(36, CAT[e.cat], { parent: g.id, x: -172 });
  s.text(e.sender, { parent: g.id, size: 20, weight: 600, color: TEXT, anchor: "left", mw: 0.3, x: -138, y: -12 });
  s.text(e.subject, { parent: g.id, size: 18, weight: 400, color: DIM, anchor: "left", mw: 0.3, x: -138, y: 13 });
  s.text(e.time, { parent: g.id, size: 16, weight: 400, color: DIM, anchor: "right", mw: 0.2, x: 190, y: -12 });
  return g;
}

/** The Serein mark: a drawn ring, horizon and dusk sun. `f0` null draws it complete. */
function mark(s, x, y, f0, parent) {
  const g = s.group({ name: "mark", parent, x, y, effects: [{ type: "glow", radius: 40, intensity: 0.8, color: VIOLET }] });
  const ring = s.ellipse(114, null, { parent: g.id, stroke: TEXT, sw: 6, shape: { lineCap: "round" } });
  const horizon = s.path([["M", -75, 19], ["L", 75, 19]], { parent: g.id, stroke: TEXT, sw: 6 });
  const sun = s.ellipse(44, DUSK, { parent: g.id, y: -8 });
  if (f0 !== null) {
    ring.draw({ at: f0, dur: f(16), ease: "outExpo" });
    horizon.draw({ at: f0 + f(6), dur: f(14), ease: "outExpo" });
    sun.animate({ scale: [0.6, 1, "spring(170,18,1)"] }, { at: f0 + f(12), dur: f(16) });
    sun.animate({ opacity: [0, 1, "linear"] }, { at: f0 + f(12), dur: f(4) });
  }
  return g;
}

function wordmark(s, x, y, f0, parent) {
  const w = s.text("Serein", { parent, x, y, size: 140, weight: 800, color: TEXT, tracking: -0.035 });
  if (f0 !== null) w.animate({ offsetY: [40, 0], opacity: [0, 1] }, { at: f0, dur: f(12), ease: "outExpo", by: "character", staggerMs: 30 });
  return w;
}

/**
 * A flex row over an absolute, inset-0 background plate sized to fit its
 * content — the same shape `s.pill()` builds internally, generalized to
 * arbitrary children so a chip/toast/CTA can mix an icon, a dot and text.
 * `buildChildren()` must create its clips fresh (not reuse ones already
 * parented elsewhere) — the plate is created first, before them, so it
 * keeps the lowest z and draws behind.
 */
function plateRow(s, o, buildChildren) {
  const { fillColor = CARD, stroke = LINE, r = 24, padX = 24, padY = 12, gap = 12, x = 0, y = 0, anchor, atTime, dur, name = "plate", shadow } = o;
  const plate = s.rect(10, 10, fillColor, {
    name: `${name}-bg`, stroke, r, at: atTime, dur, absolute: true,
    effects: shadow ? [{ type: "dropShadow", offsetX: 0, offsetY: 10, blur: 30, color: "rgba(0,0,0,0.35)" }] : undefined
  });
  const children = buildChildren();
  const g = s.row(children, { name, at: { x, y }, anchor, align: "center", gap, padding: { top: padY, bottom: padY, left: padX, right: padX }, start: atTime, dur });
  plate.parentId = g.id;
  return g;
}

const EASE_MAP = { in: "easeIn", out: "easeOut", inOut: "easeInOut", outExpo: "easeOutExpo", inExpo: "easeInExpo", linear: "linear" };
const easeName = (e) => EASE_MAP[e] ?? e;
function keyframesForLocal(spec, defaultEase) {
  if (Array.isArray(spec[0])) return spec.map(([t, value, e]) => (e ? { t, value, easing: easeName(e) } : { t, value }));
  const [a, b, e] = spec;
  return [{ t: 0, value: a }, { t: 1, value: b, easing: easeName(e ?? defaultEase) }];
}

/**
 * Like `clip.animate()`, for a curve that moves away from rest and should
 * hold its last value for the rest of the clip. `.animate()`'s own in/out
 * auto-detection (`isExitShapedCurves`) tags a curve shaped like this
 * "out", but leaves `delayMs` computed forward from the clip's own start —
 * the compiler reads an "out" role's `delayMs` counting *backward* from the
 * clip's own end, so the tag and the delay disagree whenever the window
 * does not already end exactly at the clip's own end. `clip.exit()` gets
 * this right, but only for a curve that starts at rest; this is the same
 * fix for an arbitrary multi-waypoint curve (a tone-selection pill sliding
 * between two non-rest positions, mid-clip).
 */
function holdOut(clip, props, o = {}) {
  const { at = 0, dur = 0.3, ease = "outExpo" } = o;
  const windowEndMs = Math.round((at + dur) * 1000);
  const delayMs = Math.max(0, clip.durationMs - windowEndMs);
  const curves = Object.entries(props).map(([property, spec]) => ({ property, keyframes: keyframesForLocal(spec, ease) }));
  clip.animations = [...(clip.animations ?? []), {
    id: `${clip.id}_ho${(clip.animations ?? []).length}`, role: "out", preset: "custom",
    delayMs, durationMs: Math.round(dur * 1000), custom: { curves }
  }];
  return clip;
}

/** Bottom-left kicker + headline over a scrim, shared by S4a–S4d. */
function labels(s, kicker, headline) {
  if (headline) {
    s.rect(W, H, { type: "linear", angle: 90, stops: [{ offset: 0, color: "rgba(10,15,31,0)" }, { offset: 0.55, color: "rgba(10,15,31,0)" }, { offset: 1, color: "rgba(10,15,31,0.85)" }] }, { name: "scrim" });
  }
  s.kicker(kicker, { x: -864, y: -444, at: f(4), dur: f(10), size: 24, weight: 600, color: DIM });
  if (headline) {
    const h = s.text(headline, { name: "headline", anchor: "left", mw: 0.8, x: -864, y: 418, size: 72, weight: 800, color: TEXT, tracking: -0.03 });
    h.animate({ offsetY: [30, 0], opacity: [0, 1] }, { at: f(10), dur: f(12), ease: "outExpo", by: "word", staggerMs: 60 });
  }
}

// ---------------------------------------------------------------------------
// The card wall (S1, reused dimmed in S5)

function layerCards(n, cols, y0, span, seed) {
  return Array.from({ length: n }, (_, k) => ({
    x: cols[(k * 3 + seed) % cols.length] * 460 + (hash(seed * 50 + k) - 0.5) * 60,
    y: y0 + (k / n) * span + (hash(seed * 70 + k) - 0.5) * 80
  }));
}
const FAR = layerCards(9, [-2, 0, 2, -1, 1], -640, 1950, 1).map((c, k) => ({ ...c, email: k }));
const MID = layerCards(7, [-1, 1, 0, -2, 2], -560, 1900, 2).map((c, k) => ({ ...c, x: c.x + 230, email: 9 + k }));
const NEAR = layerCards(5, [-1, 1, 0], -380, 1700, 3).map((c, k) => ({ ...c, x: c.x - 115, email: (16 + k) % 18 }));

const WALL_REPEATER = { count: 8, positionStep: { x: 0, y: 250 }, timeStepMs: 0, colorStep: { hueDegrees: 0, brightness: -0.01 } };

/** The tilted 3D wall of email cards. `o.scrollKeys`: `[[t (0..1), px], …]`. */
function wall(s, o) {
  const w = s.group({ name: "wall", opacity: o.opacity, effects: o.effects, rotation: -12, tx: { rotationX: 28, perspective: 1800 } });
  const layer = (name, speed, opacity) => {
    const g = s.group({ name, parent: w.id, opacity });
    g.animate({ offsetY: o.scrollKeys.map(([t, val]) => [t, -val * speed]) }, { at: 0, dur: o.len, ease: "linear" });
    if (o.wiggle) {
      // A wiggle whose amplitude ramps from 0 to 6px over the scene's last 26
      // frames: `el.loop()`'s wiggle link has a fixed amplitude, so this is
      // baked frame-by-frame with `expr()` instead (matches the reference
      // build's own per-frame bake).
      g.expr((t, { frame }) => {
        const a = frame < 96 ? 0 : (6 * (frame - 96)) / 26;
        return {
          offsetX: a * (Math.sin(frame * 1.7) + Math.sin(frame * 2.9 + 1)) * 0.5,
          offsetY: a * (Math.sin(frame * 2.3 + 2) + Math.sin(frame * 3.7)) * 0.5
        };
      }, { at: 0, dur: o.len });
    }
    return g;
  };
  const skel = layer("skeleton", 0.8, 0.6);
  for (let col = 0; col < 5; col++) {
    const x = (col - 2) * 460 + 230;
    const y = -700 + (col % 2) * 125;
    s.rect(420, 88, CARD, { parent: skel.id, r: 18, stroke: LINE, x, y, tx: { depthPx: -340 }, repeater: WALL_REPEATER });
    s.rect(150, 12, "rgba(148,163,184,0.2)", { parent: skel.id, r: 6, x: x - 63, y: y - 10, tx: { depthPx: -340 }, repeater: WALL_REPEATER });
    s.rect(240, 10, "rgba(148,163,184,0.12)", { parent: skel.id, r: 5, x: x - 18, y: y + 11, tx: { depthPx: -340 }, repeater: WALL_REPEATER });
  }
  const far = layer("far", 0.85, 0.5);
  for (const c of FAR) emailCard(s, EMAILS[c.email], { parent: far.id, x: c.x, y: c.y, depth: -300, unread: o.unread, shadow: false });
  const mid = layer("mid", 1, 1);
  for (const c of MID) emailCard(s, EMAILS[c.email], { parent: mid.id, x: c.x, y: c.y, depth: 0, unread: o.unread });
  const near = layer("near", 1.19, 1);
  for (const c of NEAR) emailCard(s, EMAILS[c.email], { parent: near.id, x: c.x, y: c.y, depth: 220, unread: o.unread });
  return w;
}

// ---------------------------------------------------------------------------
// S1 The flood (123 frames)

const s1 = v.scene("S1", f(123), (s) => {
  s.backdrop({ colors: [INK, INK2], opacity: 0.6, seed: 3 });
  wall(s, {
    unread: true, opacity: 1, len: f(123),
    scrollKeys: [[0, 0], [96 / 122, (700 / 148) * 96], [1, (700 / 148) * 148]]
  });
  const scrim = s.glow({ size: 1500, alpha: 0, name: "counter-scrim" });
  scrim.shapeStyle.fillStyle = { type: "radial", stops: [{ offset: 0, color: "rgba(10,15,31,0.75)" }, { offset: 0.35, color: "rgba(10,15,31,0.45)" }, { offset: 0.7071, color: "rgba(10,15,31,0)" }] };
  const enter = (c) => {
    c.animate({ opacity: [0, 1, "out"] }, { at: f(8), dur: f(12) });
    c.animate({ blur: [30, 0, "linear"] }, { at: f(8), dur: f(12) });
  };
  enter(s.text("You have", { size: 48, weight: 400, color: DIM, y: -190, tracking: -0.01 }));
  const num = s.text("0", {
    name: "counter", size: 300, weight: 800, color: TEXT, y: 0, tracking: -0.045,
    effects: [{ id: "gl", type: "stylize", mode: "glitch", amount: 0, seed: 5, animate: true }]
  });
  enter(num);
  // BRIEF.md asks for easeInExpo; the reference build used a cubic-bezier
  // ease-in-quad instead so the count reads "near 300" at frame 40 — kept.
  num.count({ from: 0, to: 2847, at: f(12), dur: f(88), groupSeparator: ",", ease: "cubic-bezier(0.55,0.085,0.68,0.53)" });
  num.tween("effect.gl.amount", [[0, 0], [1, 0.5]], { at: f(96), dur: f(26) });
  enter(s.text("unread emails.", { size: 48, weight: 400, color: DIM, y: 190, tracking: -0.01 }));
  // rgbSplit.amount is a source-pixel displacement; BRIEF's 0.4 endpoint is
  // subpixel at frame size, so the reference build used a visible 14px
  // endpoint instead — kept.
  const split = s.adjust([{ id: "rgb", type: "stylize", mode: "rgbSplit", amount: 0 }], { name: "rgbsplit" });
  split.tween("effect.rgb.amount", [[0, 0], [1, 14]], { at: f(96), dur: f(26) });
});

// ---------------------------------------------------------------------------
// S2 The name (69 frames)

// The mark and wordmark sit in a row, 32px gap, centred at y -30 — placed by
// hand (the pack has no flex primitive that measures a bare `s.path()`
// child's own box, so a real flex row here would size the mark's group as
// canvas-wide; see the port report).
const LOGO = { markX: -221, wordX: 76 };

const s2 = v.scene("S2", f(69), (s) => {
  s.rect(W, H, INK, { name: "ink" });
  s.glow({ size: 900, alpha: 0.25 });
  const row = s.group({ name: "logo", y: -30 });
  mark(s, LOGO.markX, 0, f(0), row.id);
  wordmark(s, LOGO.wordX, 0, f(8), row.id);
  const tag = s.text("The inbox that sorts itself.", { size: 44, weight: 400, color: DIM, y: 110, tracking: -0.01 });
  tag.animate({ opacity: [0, 1], offsetY: [20, 0] }, { at: f(30), dur: f(12) });
  s.flash({ at: 0, dur: f(10), peak: 0.9 });
});
// Fades to ink over its last 8 frames (184–191 in the whole film). An "out"
// role's window is placed by counting `delayMs` back from the clip's own
// end, not forward from its start.
s2.group.animations = [{
  id: "s2-fade", role: "out", preset: "custom", delayMs: msAbs(69) - msAbs(61 + 8), durationMs: msAbs(8),
  custom: { curves: [{ property: "opacity", keyframes: [{ t: 0, value: 1 }, { t: 1, value: 0, easing: "linear" }] }] }
}];

// ---------------------------------------------------------------------------
// S3 One email (53 frames)

const s3 = v.scene("S3", f(53), (s) => {
  s.backdrop({ colors: [INK, INK2], opacity: 0.3, seed: 4 });
  const card = s.group({ name: "big-card" });
  card.animate({ opacity: [0, 1], offsetY: [24, 0] }, { at: 0, dur: f(10) });
  // One waypoint curve spanning the whole clip, not two stacked `.animate()`
  // calls — a second call whose window ends before the clip's own end would
  // need the same backward-delay fix `holdOut()` gives everything below;
  // spanning the full clip sidesteps the question entirely.
  card.animate({ scale: [[0, 1], [36 / 53, 1.04, "linear"], [52 / 53, 1.08, "linear"], [1, 1.08, "linear"]] }, { at: 0, dur: f(53) });
  const r = s.rect(1100, 220, CARD, { parent: card.id, r: 28, stroke: LINE, effects: [{ id: "sh", type: "dropShadow", offsetX: 0, offsetY: 12, blur: 36, color: "rgba(0,0,0,0.45)" }] });
  r.tween("effect.sh.offsetY", [[0, 12], [1, 40, "easeOutExpo"]], { at: f(36), dur: f(16) });
  s.ellipse(64, CAT.Now, { parent: card.id, x: -482, y: -42 });
  s.text("Maya Chen", { parent: card.id, size: 34, weight: 600, color: TEXT, anchor: "left", mw: 0.5, x: -430, y: -58 });
  const subj = s.text(EMAILS[0].subject, { parent: card.id, size: 30, weight: 400, color: TEXT, anchor: "left", mw: 0.5, x: -430, y: -16 });
  subj.scramble({ at: f(4), dur: f(24), seed: 3 });
  s.text("9:41", { parent: card.id, size: 26, weight: 400, color: DIM, anchor: "right", mw: 0.2, x: 514, y: -58 });
  s.rect(760, 14, "rgba(148,163,184,0.2)", { parent: card.id, r: 7, x: -50, y: 43 });
  s.rect(520, 14, "rgba(148,163,184,0.2)", { parent: card.id, r: 7, x: -170, y: 73 });

  // The chip: right edge on the card's right edge, 40px below the card.
  const chip = s.group({ name: "chip", parent: card.id, y: 175 });
  chip.animate({ opacity: [0, 1], offsetY: [14, 0] }, { at: f(8), dur: f(12) });
  plateRow(s, { fillColor: CARD, padX: 28, padY: 12, gap: 10, x: 449, atTime: 0, dur: f(43), name: "reading-chip" }, () => {
    const spin = s.ellipse(20, null, { stroke: VIOLET, sw: 2.5, shape: { trimStart: 0.1, trimEnd: 0.35, lineCap: "round" } });
    spin.loop({ rotation: [0, rad(-360)] }, f(20), { ease: "linear" });
    spin.exit({ to: { opacity: 0 }, at: f(36), dur: f(8), ease: "linear" });
    const reading = s.text("Serein is reading…", { size: 22, weight: 600, color: DIM, mw: 0.3 });
    // A colour pulse between DIM and violet, 16-frame period, approximated as
    // a repeating waypoint tween — `tween()` has no looping role, only
    // `enter`/`animate`'s curve-based `loop()` does, and that only drives
    // plain properties, not a style-track target like `text.color`.
    const pulse = [];
    for (let fr = 0; fr <= 43; fr += 8) pulse.push([fr / 43, fr % 16 === 0 ? DIM : VIOLET, "easeInOut"]);
    pulse.push([1, pulse[pulse.length - 1][1], "easeInOut"]);
    reading.tween("text.color", pulse, { dur: f(43) });
    reading.exit({ to: { opacity: 0 }, at: f(36), dur: f(8), ease: "linear" });
    return [spin, reading];
  }).parentId = chip.id;

  plateRow(s, { fillColor: "rgba(0,0,0,0)", stroke: "rgba(0,0,0,0)", padX: 4, padY: 4, gap: 10, x: 449, atTime: f(36), dur: f(53 - 36), name: "sorted-chip" }, () => {
    const dot = s.ellipse(10, NOW, {});
    dot.animate({ opacity: [0, 1, "linear"] }, { at: f(36), dur: f(8) });
    const sorted = s.text("Sorted → Now", { size: 22, weight: 600, color: NOW, mw: 0.3 });
    sorted.animate({ opacity: [0, 1, "linear"] }, { at: f(36), dur: f(8) });
    return [dot, sorted];
  }).parentId = chip.id;
});

// ---------------------------------------------------------------------------
// S4a Sort (105 frames)

// S4a, S4b and S4c each carry the transition that leads into the next scene:
// `v.series()`'s transitions overlap the two scenes they join by starting
// the incoming scene early, which would shift every later scene's start
// away from the BRIEF's absolute frame numbers. Lengthening the outgoing
// scene by exactly its own transition's duration cancels that shift, so
// every scene starts at the same absolute frame as the original document —
// the same "runs longer than its own nominal end" technique the original
// hand-written build used, just expressed as a duration instead of a
// hand-picked absolute end frame.
const WHIP_MS = 250, GRADIENT_WIPE_MS = 350, IRIS_MS = 300;

const s4a = v.scene("S4a", f(105) + WHIP_MS / 1000, (s) => {
  s.backdrop({ colors: [INK, INK2], opacity: 0.35, seed: 5 });
  const board = s.group({ name: "board", y: -100, s: 0.8, tx: { rotationX: 18, rotationY: -10, perspective: 2400 } });
  board.animate({ rotationY: [-10, -4, "linear"] }, { at: 0, dur: f(105) });
  const colX = { Now: -520, Later: 0, Never: 520 };
  const byCat = { Now: [], Later: [], Never: [] };
  EMAILS.forEach((e, i) => byCat[e.cat].push(i));
  const order = [];
  for (let j = 0; j < 8; j++) for (const c of ["Now", "Later", "Never"]) if (j < byCat[c].length) order.push({ email: byCat[c][j], cat: c, slot: j });
  const landed = { Now: [], Later: [], Never: [] };
  order.forEach((o, k) => {
    const start = 6 + k * 1.2;
    // `rot` is degrees; the "rotation" curve property is radians (the same
    // unit `rotation`/`rad()` use everywhere else in this API), so it needs
    // converting before it goes into a raw `animate()` curve — unlike the
    // friendly `rotation` option on element creation, `animate()` does not
    // convert degrees for you.
    const sx = (hash(k * 5 + 1) * 2 - 1) * 900, sy = (hash(k * 5 + 2) * 2 - 1) * 600, rot = rad((hash(k * 5 + 3) * 2 - 1) * 25);
    const x = colX[o.cat], y = -240 + o.slot * 104;
    const g = s.group({ name: `fly-${k}`, parent: board.id, x, y });
    const f0 = Math.floor(start);
    const flight = (from, to) => [[0, from], [0.4, from + (to - from) * 0.7, "outExpo"], [0.7, from + (to - from) * 1.05, "outExpo"], [0.86, from + (to - from) * 0.98, "outExpo"], [1, to, "outExpo"]];
    g.animate({
      offsetX: flight(sx - x, 0), offsetY: flight(sy - y, 0),
      rotation: flight(-rot, 0), scale: flight(0.7, 1)
    }, { at: f(f0), dur: f(15) });
    g.animate({ opacity: [0, 1, "linear"] }, { at: f(f0), dur: f(2) });
    emailCard(s, EMAILS[o.email], { parent: g.id });
    landed[o.cat].push(f0 + 10);
  });
  for (const c of ["Now", "Later", "Never"]) {
    const h = s.group({ name: `head-${c}`, parent: board.id, x: colX[c], y: -330 });
    h.animate({ opacity: [0, 1] }, { at: f(2), dur: f(10) });
    // Beat-anchored emphasis (sequence beats 4 and 6) has no `at`/`dur`
    // counterpart in this pack's `preset()` — it only places by clip-local
    // time, not by musical beat index — so the pulse is placed at those
    // beats' own computed local time instead of a `beat` reference.
    for (const k of [4, 6]) {
      const local = beatFrame(k) - 245;
      h.preset("pulse", { at: f(local), dur: f(8), role: "emphasis", intensity: 0.06 });
    }
    const first = landed[c][0], last = landed[c][landed[c].length - 1];
    plateRow(s, { fillColor: CARD, padX: 22, padY: 12, gap: 12, name: `head-${c}-pill` }, () => {
      const dot = s.ellipse(12, CAT_SOLID[c], { effects: [{ type: "glow", radius: 12, intensity: 0.6 }] });
      const label = s.text(`${c}  0`, { size: 24, weight: 600, color: TEXT });
      label.count({ from: 0, to: landed[c].length, at: f(first), dur: f(Math.max(1, last - first)), prefix: `${c}  ` });
      return [dot, label];
    }).parentId = h.id;
  }
  labels(s, "01 — Sort", "Sorted before you look.");
  s.flash({ at: 0, dur: f(8), peak: 0.6 });
});

// ---------------------------------------------------------------------------
// S4b Summarize (106 frames)

const s4b = v.scene("S4b", f(106) + GRADIENT_WIPE_MS / 1000, (s) => {
  s.backdrop({ colors: [INK, INK2], opacity: 0.35, seed: 6 });
  const card = s.group({ name: "sum-card", x: 160 });
  card.animate({ opacity: [0, 1] }, { at: 0, dur: f(8) });
  const r = s.rect(900, 700, CARD, { parent: card.id, r: 28, stroke: LINE, effects: [{ id: "sh", type: "dropShadow", offsetX: 0, offsetY: 30, blur: 80, color: "rgba(0,0,0,0.5)" }] });
  r.tween("shape.height", [[0, 700 / H], [1, 300 / H, "spring(170,18,1)"]], { at: f(50), dur: f(20) });
  r.tween("shape.y", [[0, 0.5 - 350 / H], [1, 0.5 - 150 / H, "spring(170,18,1)"]], { at: f(50), dur: f(20) });
  const top = -350;
  const head = s.group({ name: "sum-head", parent: card.id });
  head.exit({ to: { offsetY: 200 }, at: f(50), dur: f(20), ease: "spring(170,18,1)" });
  s.ellipse(48, CAT.Later, { parent: head.id, x: -386, y: top + 60 });
  s.text("Priya Nair", { parent: head.id, size: 22, weight: 600, color: DIM, anchor: "left", mw: 0.4, x: -342, y: top + 44 });
  s.text("Q3 planning: notes from Tuesday", { parent: head.id, size: 30, weight: 600, color: TEXT, anchor: "left", mw: 0.4, x: -342, y: top + 78 });
  const chipX = 339, chipY = top + 60;
  const border = s.rect(152, 42, DUSK, { parent: head.id, r: 21, x: chipX, y: chipY, at: f(56) });
  border.animate({ opacity: [0, 1] }, { at: 0, dur: f(8) });
  s.rect(150, 40, CARD, { parent: head.id, r: 20, stroke: LINE, x: chipX, y: chipY });
  s.text("6 min read", { parent: head.id, size: 20, weight: 600, color: DIM, x: chipX, y: chipY, dur: f(55) });
  const fast = s.text("20 sec read", { parent: head.id, size: 20, weight: 600, color: TEXT, x: chipX, y: chipY, at: f(56) });
  fast.scramble({ at: 0, dur: f(8), seed: 5 });
  const widths = [780, 700, 820, 610, 760, 690, 800, 540, 740, 660, 780, 420];
  widths.forEach((w, i) => {
    const y = top + 136 + i * 44 + 8;
    const line = s.rect(w, 16, "rgba(148,163,184,0.2)", { parent: card.id, r: 8, x: -410 + w / 2, y, dur: f(52) });
    line.animate({ opacity: [0, 1], offsetY: [-16, 0] }, { at: f(4 + Math.round(i * 1.2)), dur: f(10) });
    line.exit({ to: { scaleY: 0 }, at: f(30 + Math.round(((y - top - 118) / 572) * 20) - 1), dur: f(5), ease: "outExpo" });
  });
  const bar = s.rect(900, 4, DUSK, { parent: card.id, x: 0, y: top + 118, at: f(30), dur: f(22), effects: [{ type: "glow", radius: 24, intensity: 1, color: VIOLET }] });
  bar.exit({ to: { offsetY: 572 }, at: 0, dur: f(20), ease: "inOut" });
  bar.animate({ opacity: [1, 0, "linear"] }, { at: f(18), dur: f(4) });
  ["Launch moves to Nov 12", "Budget approved, +8%", "You own the pricing page"].forEach((b, i) => {
    const f0 = 52 + Math.round(i * 4.5);
    const y = -150 + 128 + i * 50 + 14;
    const d = s.ellipse(10, DUSK, { parent: card.id, x: -405, y, at: f(f0) });
    d.animate({ opacity: [0, 1] }, { at: 0, dur: f(4) });
    const t = s.text(b, { parent: card.id, size: 28, weight: 400, color: TEXT, anchor: "left", mw: 0.4, x: -382, y, at: f(f0) });
    t.preset("wipe", { at: 0, dur: 0.3, ease: "outExpo", direction: "left", softness: 0.05 });
  });
  labels(s, "02 — Summarize", "The gist, in three lines.");
});

// ---------------------------------------------------------------------------
// S4c Reply (106 frames)

const s4c = v.scene("S4c", f(106) + IRIS_MS / 1000, (s) => {
  s.backdrop({ colors: [INK, INK2], opacity: 0.35, seed: 7 });
  const comp = s.group({ name: "composer", x: 140 });
  comp.animate({ opacity: [0, 1], offsetY: [20, 0] }, { at: 0, dur: f(10) });
  comp.exit({ to: { opacity: 0, offsetY: 40 }, at: f(70), dur: f(16), ease: "inOut" });
  s.rect(1000, 460, CARD, { parent: comp.id, r: 28, stroke: LINE, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 30, blur: 80, color: "rgba(0,0,0,0.5)" }] });
  s.text("To: Maya Chen", { parent: comp.id, size: 22, weight: 600, color: DIM, anchor: "left", mw: 0.4, x: -456, y: -183 });
  s.rect(912, 1, LINE, { parent: comp.id, y: -148 });
  const body = s.text("Signed. Thanks for chasing this. Sending the countersigned copy now.", { parent: comp.id, size: 36, weight: 400, color: TEXT, anchor: "left", mw: 900 / W, x: -456, y: -70, tracking: -0.01, style: { lineHeight: 1.4 } });
  body.typewriter({ at: f(8), dur: 1.4, caret: { color: VIOLET, widthPx: 3, blinkPeriodMs: 533 } });
  // Three tone chips, gap 56 — a fixed-width pill each (a real flex row would
  // leave the selection pill's slide distance to be measured after layout,
  // which this authoring API cannot read back, so the row is laid out by
  // hand at these three known centres instead).
  const TONE_W = 110, TONE_GAP = 56, toneX = (i) => -300 - (3 * TONE_W + 2 * TONE_GAP) / 2 + TONE_W / 2 + i * (TONE_W + TONE_GAP);
  const tones = ["Formal", "Brief", "Warm"].map((t, i) => {
    s.rect(TONE_W, 48, null, { parent: comp.id, r: 24, stroke: LINE, x: toneX(i), y: 64 });
    return s.text(t, { parent: comp.id, size: 22, weight: 600, color: DIM, x: toneX(i), y: 64 });
  });
  const sel = s.rect(116, 48, "rgba(167,139,250,0.25)", { parent: comp.id, r: 24, stroke: "rgba(167,139,250,0.45)", x: toneX(0), y: 64 });
  sel._z = tones[0]._z - 0.6;
  const toneMove = (from, to) => [[0, from], [0.5, from + (to - from) * 0.78, "inOut"], [0.82, from + (to - from) * 1.04, "outExpo"], [1, to, "outExpo"]];
  holdOut(sel, { offsetX: toneMove(0, toneX(2) - toneX(0)), scaleX: toneMove(1, 106 / 116) }, { at: f(14), dur: f(20) });
  const send = s.group({ name: "send", parent: comp.id, x: 385, y: 158 });
  send.exit({ to: { scale: 0.94 }, at: f(64), dur: f(3), ease: "outExpo" });
  send.animate({ scale: [0.94, 1, "spring(170,18,1)"] }, { at: f(67), dur: f(15) });
  s.rect(150, 64, DUSK, { parent: send.id, r: 32, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 12, blur: 36, color: "rgba(167,139,250,0.35)" }] });
  s.text("Send", { parent: send.id, size: 24, weight: 600, color: INK });
  const px = (val) => (960 - 30 + val) / W, py = (val) => (540 - 22 + val) / H;
  const plane = s.path([["M", px(0), py(0)], ["L", px(60), py(22)], ["L", px(0), py(44)], ["L", px(14), py(22)], ["Z"]], {
    name: "plane", at: f(64), dur: f(90 - 64), fill: TEXT,
    motionBlur: { samplesPerFrame: 8, shutterAngle: 180 },
    temporalEcho: { copies: 6, intervalMs: 50, opacityDecay: 0.6 }
  });
  const sx = 140 + 385, sy = 158;
  const pathD = `M${sx / W} ${sy / H} C${(sx + 175) / W} ${(sy + 120) / H} ${(sx + 450) / W} ${(sy - 320) / H} ${1080 / W} ${-680 / H}`;
  plane.preset("followPath", { at: 0, dur: f(22), ease: "inOut", role: "emphasis", d: pathD, pathX: 0, pathY: 0, pathWidth: 1, pathHeight: 1, orient: true });
  const toast = plateRow(s, { fillColor: CARD, padX: 32, padY: 14, gap: 12, y: -390, name: "toast", shadow: true }, () => [
    s.ellipse(12, DUSK, {}),
    s.text("Sent · 0.4 s", { size: 24, weight: 600, color: TEXT })
  ]);
  toast.animate({ opacity: [0, 1, "out"], offsetY: [-30, 0, "out"] }, { at: f(72), dur: f(14) });
  labels(s, "03 — Reply", "Drafts in your voice.");
});

// ---------------------------------------------------------------------------
// S4d Inbox zero (53 frames)

const s4d = v.scene("S4d", f(53), (s) => {
  const field = s.backdrop({ colors: [INK, INK2], opacity: 0.85, seed: 8 });
  const fieldFxId = field.effects[0].id;
  field.tween(`effect.${fieldFxId}.colorB`, [[0, INK2], [1, CALM, "easeOut"]], { at: f(30), dur: f(22) });
  const count = s.text("0", { name: "countdown", size: 320, weight: 800, color: TEXT, y: -40, tracking: -0.045, dur: f(37) });
  count.count({ from: 2847, to: 0, at: 0, dur: f(38), groupSeparator: ",", ease: "inOut" });
  const zero = s.text("0", { name: "zero", size: 320, weight: 800, color: TEXT, y: -40, tracking: -0.045, style: { fill: DUSK }, at: f(38) });
  zero.animate({ scale: [1.4, 1, "outExpo"] }, { at: 0, dur: f(10) });
  zero.animate({ blur: [30, 0, "linear"] }, { at: 0, dur: f(4) });
  const burst = s.rect(W, H, null, { name: "particles", at: f(38), dur: f(14), blendMode: "screen", effects: [{ type: "generator", mode: "particles", colorA: "#000000", colorB: "#a78bfa", seed: 9, animate: true, amount: 0.25 }] });
  burst._z = zero._z - 0.75;
  burst.animate({ opacity: [0.35, 0, "linear"] }, { at: 0, dur: f(14) });
  for (let i = 0; i < 20; i++) {
    const angle = (i * Math.PI * 2) / 20 + hash(i + 91) * 0.3;
    const radius = 225 + hash(i + 59) * 35;
    const reach = 125 + hash(i + 71) * 140;
    const color = ["#60a5fa", "#a78bfa", "#fda4af"][i % 3];
    const dot = s.ellipse(5 + hash(i + 84) * 5, color, { name: "burst-dot", at: f(38), dur: f(14), x: Math.cos(angle) * radius, y: -40 + Math.sin(angle) * radius });
    dot._z = zero._z - 0.5 + i * 0.001;
    dot.animate({ offsetX: [0, Math.cos(angle) * reach, "outExpo"], offsetY: [0, Math.sin(angle) * reach, "outExpo"], opacity: [0.9, 0, "linear"] }, { at: 0, dur: f(14) });
  }
  const sub = s.text("Inbox zero. Every morning.", { size: 48, weight: 600, color: TEXT, y: 170, tracking: -0.01 });
  sub.animate({ opacity: [0, 1], offsetY: [20, 0] }, { at: f(40), dur: f(12) });
  labels(s, "04 — Zero", null);
});

// ---------------------------------------------------------------------------
// S5 Promise: two word cards joined by a glitch around the hard cut

function wordCard(s, word, dusk, len) {
  s.rect(W, H, INK, { name: "ink" });
  wall(s, { unread: false, opacity: 0.22, effects: [{ type: "blur", radius: 60 }], len, scrollKeys: [[0, 300], [1, 300 + len * FPS * 1.4]] });
  s.adjust([{ type: "vignette", amount: 0.1, softness: 0.6 }], { name: "vignette" });
  const w = s.text(word, { name: "word", size: 200, weight: 800, color: TEXT, tracking: -0.045, style: { lineHeight: 1.02, fill: dusk ? DUSK : undefined } });
  w.animate({ opacity: [0.5, 1, "linear"] }, { at: 0, dur: f(1) });
  w.animate({ scale: [1.45, 1], blur: [42, 0] }, { at: 0, dur: f(7) });
  s.flash({ at: 0, dur: f(3), peak: 0.2 });
}

const s5a = v.scene("S5a", f(27), (s) => wordCard(s, "Private by design.", false, f(27)));
const s5b = v.scene("S5b", f(26), (s) => wordCard(s, "Runs on-device.", true, f(26)));

// ---------------------------------------------------------------------------
// S6 End card (112 frames)

const s6 = v.scene("S6", f(112), (s) => {
  s.backdrop({ colors: [INK, CALM], opacity: 0.85, seed: 9 });
  s.glow({ size: 1100, alpha: 0.25 });
  const logo = s.group({ name: "end-logo", y: -106 });
  logo.animate({ scale: [1.2, 1, "out"] }, { at: 0, dur: f(20) });
  logo.animate({ opacity: [0, 1, "linear"] }, { at: 0, dur: f(6) });
  mark(s, LOGO.markX, 0, null, logo.id);
  wordmark(s, LOGO.wordX, 0, null, logo.id);
  const tag = s.text("The inbox that sorts itself.", { size: 56, weight: 600, color: TEXT, y: 38, tracking: -0.01, style: { fill: DUSK } });
  tag.animate({ opacity: [0, 1], offsetY: [20, 0] }, { at: f(10), dur: f(14) });
  const cta = plateRow(s, { fillColor: "rgba(10,15,31,0.35)", stroke: "rgba(248,250,252,0.3)", padX: 36, padY: 16, y: 143, name: "cta" }, () => [
    s.text("Early access · Mac & iPhone", { size: 30, weight: 400, color: TEXT })
  ]);
  cta.animate({ opacity: [0, 1, "out"], offsetY: [48, 0, "out"] }, { at: f(20), dur: f(16) });
  const leak = s.rect(W, H, null, { name: "light-leak", dur: f(12), blendMode: "screen", effects: [{ type: "generator", mode: "lightLeak", colorA: "#fda4af", colorB: "#a78bfa", seed: 2, animate: true, amount: 1 }] });
  leak.animate({ opacity: [[0, 0], [0.5, 0.55, "outExpo"], [1, 0, "inExpo"]] }, { at: 0, dur: f(12) });
  s.flash({ at: 0, dur: f(10), peak: 0.8 });
});
// Fades to ink over its last 14 frames (765–779 in the whole film). An "out"
// role's window is placed by counting `delayMs` back from the clip's own
// end, not forward from its start.
s6.group.animations = [{
  id: "s6-fade", role: "out", preset: "custom", delayMs: msAbs(112) - msAbs(97 + 14), durationMs: msAbs(14),
  custom: { curves: [{ property: "opacity", keyframes: [{ t: 0, value: 1 }, { t: 1, value: 0, easing: "linear" }] }] }
}];

// ---------------------------------------------------------------------------
// Assembly
//
// Hard cuts everywhere except S4a→S4b (whip), S4b→S4c (gradientWipe) and
// S4c→S4d (iris) — `v.series()`'s transitions overlap the two scenes they
// join by starting the incoming scene early. S4a/S4b/S4c were each
// lengthened above by their own outgoing transition's duration, which
// cancels that shift, so every scene here starts at the same absolute frame
// as the original 26.0s/780-frame document (verified against
// `s4d.group.startMs` etc. below).

v.series([
  s1, s2, s3, s4a,
  v.transition("whip", WHIP_MS / 1000, { direction: "right", easing: "easeInOut" }),
  s4b,
  v.transition("gradientWipe", GRADIENT_WIPE_MS / 1000, { direction: "left", map: "noise", seed: 4, easing: "easeInOutExpo" }),
  s4c,
  v.transition("iris", IRIS_MS / 1000, { softness: 0.05, easing: "easeInOut" }),
  s4d, s5a, s5b, s6
]);

// A glitch + RGB-split burst straddling the S5a→S5b hard cut.
const GLITCH_AMOUNTS = [0.45, 1, 1, 0.5, 0.2];
const cutSec = s5b.group.startMs / 1000;
v.adjust(
  [
    { id: "gx", type: "stylize", mode: "glitch", amount: 0, seed: 11, animate: true },
    { id: "rx", type: "stylize", mode: "rgbSplit", amount: 0 }
  ],
  {
    id: "glitch-join", name: "glitch join", trackId: "t_glitch", at: cutSec - f(2), dur: f(5),
    animations: [{
      id: "glitch-join-a", role: "in", preset: "custom", delayMs: 0, durationMs: Math.round(f(5) * 1000),
      custom: { curves: [{ property: "opacity", keyframes: [{ t: 0, value: 1 }, { t: 1, value: 1, easing: "linear" }] }] },
      styleTracks: ["gx", "rx"].map((id) => ({
        target: `effect.${id}.amount`,
        keyframes: GLITCH_AMOUNTS.map((value, i) => ({ t: i / (GLITCH_AMOUNTS.length - 1), value, easing: "linear" }))
      }))
    }]
  }
);

// The scene-finishing grain + dither, across the whole film.
v.adjust(
  [
    { type: "grain", amount: 0.05, animate: true, seed: 1 },
    { type: "stylize", mode: "dither", amount: 1, seed: 7 }
  ],
  { name: "grain + dither", trackId: "t_finish" }
);

// The S1 camera push (frames 0–122), reset for S2.
v.document({
  camera2d: {
    position: { x: 0, y: 0 }, depthPx: 0, focalLengthPx: 1800, focusDepthPx: 0, aperturePx: 0,
    keyframes: [
      { timeMs: 0, position: { x: 0, y: 0 }, depthPx: 0, focusDepthPx: 0, aperturePx: 14 },
      { timeMs: msAbs(122), position: { x: 0, y: 0 }, depthPx: 260, focusDepthPx: 0, aperturePx: 14 },
      { timeMs: msAbs(123), position: { x: 0, y: 0 }, depthPx: 0, focusDepthPx: 0, aperturePx: 0 }
    ]
  },
  tempo: { bpm: 136, offsetMs: 8150, timeSignature: { beatsPerBar: 4, beatUnit: 4 } }
});

const uri = (name) => `package://nodetool-base/timelines/serein/${name}`;

const saved = await v.save(nodetool.timelines, {
  name: "Serein — The inbox that sorts itself",
  showcase: true
});
await output("timeline", {
  name: "Serein — The inbox that sorts itself",
  description: "A 26-second product launch film built from editable scene clips, text, motion, and effects.",
  videoUri: uri("launch.mp4"),
  posterUri: uri("poster.jpg"),
  ...saved
});
