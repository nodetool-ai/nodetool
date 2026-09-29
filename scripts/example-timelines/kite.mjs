// Kite: a 15-second savings-app ad built only from timeline motion graphics.
//
// `node scripts/example-timelines/build.mjs kite` writes the shipped bundle
// packages/base-nodes/nodetool/examples/timelines/kite.timeline.json.
//
// Every time value below is seconds, local to the scene (or `seq`) that
// authored it — `video()`'s `v.series()` is the only place a scene's position
// in the whole video is decided. Positions are px from the frame centre.
import { video, hash } from "@nodetool-ai/sandbox-timeline";

const W = 1920, H = 1080, FPS = 30;
const f = (frames) => frames / FPS; // a frame count from the original cut, as seconds

const INK = "#06110e", INK2 = "#0c2a21", CARD = "#0f1f1a";
const LINE = "rgba(167,243,208,0.16)", TEXT = "#f4fbf8", DIM = "#8fb3a6";
const MINT = "#34d399", LIME = "#d9f99d", CORAL = "#fb7185";
const KITE = { type: "linear", angle: 0, stops: [{ offset: 0, color: MINT }, { offset: 1, color: LIME }] };
const KITE_UP = { type: "linear", angle: 90, stops: [{ offset: 0, color: LIME }, { offset: 1, color: MINT }] };
const DISPLAY = "display";
const EASE_IO = "cubic-bezier(0.65,0,0.35,1)", EASE_OUT = "cubic-bezier(0.33,1,0.68,1)";

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: INK, ink2: INK2, text: TEXT, dim: DIM, accent: MINT },
  fonts: { display: "Space Grotesk", body: "Inter" }
});

const LOGO = { markX: -180, wordX: -60 };

/**
 * The Kite mark: a kite outline with its spars, a gradient sail and a tail.
 * `atSec` null draws it complete with no entrance.
 */
function mark(s, x, y, atSec, parentId) {
  const g = s.group({ name: "mark", parent: parentId, x, y, effects: [{ type: "glow", radius: 36, intensity: 0.7, color: MINT }] });
  const P = { top: [0, -96], right: [66, -14], bottom: [0, 104], left: [-66, -14] };
  const outline = [["M", ...P.top], ["L", ...P.right], ["L", ...P.bottom], ["L", ...P.left], ["Z"]];
  const sail = s.path(outline, { name: "sail", parent: g.id, fill: KITE_UP });
  const edge = s.path(outline, { name: "edge", parent: g.id, stroke: TEXT, sw: 6 });
  const spine = s.path([["M", ...P.top], ["L", ...P.bottom]], { name: "spine", parent: g.id, stroke: INK, sw: 4 });
  const spar = s.path([["M", ...P.left], ["L", ...P.right]], { name: "spar", parent: g.id, stroke: INK, sw: 4 });
  const tail = s.path([["M", 0, 104], ["C", 26, 128, -26, 146, 4, 170]], { name: "tail", parent: g.id, stroke: MINT, sw: 5 });
  if (atSec !== null) {
    edge.draw({ at: atSec, dur: f(16), ease: EASE_IO });
    sail.enter({ from: { opacity: 0, scale: 0.85 }, at: atSec + f(12), dur: f(10), ease: "spring(170,16,1)" });
    spine.draw({ at: atSec + f(16), dur: f(8), ease: "out" });
    spar.draw({ at: atSec + f(18), dur: f(8), ease: "out" });
    tail.draw({ at: atSec + f(20), dur: f(14), ease: "out" });
  }
  return g;
}

function wordmark(s, x, y, atSec, parentId) {
  const w = s.text("Kite", { name: "wordmark", parent: parentId, anchor: "left", mw: 0.3, x, y, size: 176, weight: 700, color: TEXT, font: DISPLAY, tracking: -0.04 });
  if (atSec !== null) w.enter({ from: { offsetY: 50, opacity: 0 }, at: atSec, dur: f(12), ease: "out", by: "character", staggerMs: 45 });
  return w;
}

// ---------------------------------------------------------------------------
// S1 The drain (0-89 of the reference cut): the paycheck disappears word by word.

const s1 = v.scene("S1", f(90), (s) => {
  s.backdrop({ colors: ["#2a0f14", INK2], opacity: 0.55, seed: 2 });
  s.streaks({ colors: ["rgba(143,179,166,0.6)", "rgba(251,113,133,0.75)", "rgba(244,251,248,0.8)"], rotationDeg: -8 });
  const scrim = s.glow(1400, { name: "text-scrim", alpha: 0 });
  scrim.shapeStyle.fillStyle = { type: "radial", stops: [{ offset: 0, color: "rgba(6,17,14,0.85)" }, { offset: 0.4, color: "rgba(6,17,14,0.55)" }, { offset: 0.7071, color: "rgba(6,17,14,0)" }] };

  // Word cards, 18 frames apiece; the last lands in coral and glitches.
  const words = [["Payday.", 0], ["Rent.", 18], ["Groceries.", 36], ["Subscriptions.", 54], ["Gone.", 72]];
  words.forEach(([word, f0], i) => {
    const last = i === words.length - 1;
    const t = s.text(word, {
      name: `word-${i}`, font: DISPLAY, size: 188, weight: 700, color: last ? CORAL : TEXT, y: -70, tracking: -0.045,
      at: f(f0), dur: last ? f(90 - f0) : f(18),
      effects: last ? [{ id: "gl", type: "stylize", mode: "glitch", amount: 0, seed: 4, animate: true }] : undefined
    });
    t.enter({ from: { scale: i === 0 ? 1.2 : 1.35, blur: 26, opacity: 0 }, at: 0, dur: f(8), ease: "out" });
    if (last) t.tween("effect.gl.amount", [[0, 0], [1, 0.6]], { at: f(80 - f0), dur: f(10) });
    else t.animate({ offsetX: [0, -60], opacity: [1, 0] }, { at: f(12), dur: f(6), ease: "in" });
  });

  // The balance drains underneath: a ticker and a bar that empties from the right.
  const bal = s.group({ name: "balance", y: 170 });
  bal.enter({ from: { offsetY: 20, opacity: 0 }, at: f(4), dur: f(12), ease: "out" });
  s.text("BALANCE", { parent: bal.id, anchor: "left", mw: 0.2, x: -300, y: -34, size: 28, weight: 600, color: DIM, tracking: 5 / 28 });
  const amount = s.text("$2,480", { name: "balance-amount", parent: bal.id, anchor: "right", mw: 0.3, x: 300, y: -40, size: 56, weight: 700, color: TEXT });
  amount.count({ from: 2480, to: 12, at: f(6), dur: f(80), prefix: "$", groupSeparator: ",", ease: EASE_IO });
  amount.tween("text.color", [[0, TEXT], [1, CORAL, "in"]], { at: f(50), dur: f(36) });
  s.rect(600, 10, "rgba(143,179,166,0.18)", { parent: bal.id, r: 5, y: 16 });
  const bar = s.rect(600, 10, MINT, { name: "balance-bar", parent: bal.id, r: 5, y: 16 });
  bar.animate({ scaleX: [1, 0.005], offsetX: [0, -300 * 0.995] }, { at: f(6), dur: f(80), ease: EASE_IO });
  bar.tween("shape.fill", [[0, MINT], [1, CORAL, "in"]], { at: f(50), dur: f(36) });
});

// ---------------------------------------------------------------------------
// S2 Meet Kite (90-172, runs under the whip into S3)

const s2 = v.scene("S2", f(83), (s) => {
  s.rect(W, H, INK, { name: "ink" });
  const g = s.glow(1100, { alpha: 0.22, y: -20 });
  g.enter({ from: { scale: 0.6, opacity: 0 }, at: 0, dur: f(30), ease: "out" });
  const row = s.group({ name: "logo", y: -70, s: 1.15 });
  row.animate({ scale: [0.96, 1.04] }, { at: 0, dur: f(82), ease: "linear" });
  mark(s, LOGO.markX, -20, f(2), row.id);
  wordmark(s, LOGO.wordX, 0, f(14), row.id);
  const meet = s.text("Meet", { anchor: "left", mw: 0.2, x: LOGO.wordX * 1.15 + 6, y: -190, size: 34, weight: 600, color: DIM, tracking: 4 / 34 }); // free placement: aligned by eye to the wordmark it introduces, not a generic column
  meet.enter({ from: { offsetY: 14, opacity: 0 }, at: f(10), dur: f(10), ease: "out" });
  const tag = s.text("Savings on autopilot.", { y: 175, font: DISPLAY, size: 54, weight: 500, color: TEXT, tracking: -0.01 });
  tag.enter({ from: { offsetY: 24, opacity: 0 }, at: f(30), dur: f(14), ease: "out", by: "word", staggerMs: 90 });
  s.flash({ at: 0, dur: f(10), peak: 0.85 });
});

// ---------------------------------------------------------------------------
// S3 The app (165-292, runs under the wipe into S4)

function phoneChart(s, parent) {
  const pts = Array.from({ length: 9 }, (_, i) => {
    const x = -170 + i * (340 / 8);
    const y = -20 - i * 15 - Math.sin(i * 1.3) * 16 - (hash(i + 12) - 0.5) * 14;
    return [x, Math.round(y)];
  });
  pts[8][1] = -150;
  const area = s.path([["M", pts[0][0], 60], ...pts.map(([x, y]) => ["L", x, y]), ["L", pts[8][0], 60], ["Z"]], {
    name: "chart-area", parent, fill: { type: "linear", angle: 90, stops: [{ offset: 0, color: "rgba(52,211,153,0.35)" }, { offset: 1, color: "rgba(52,211,153,0)" }] }
  });
  const line = s.path(pts.map(([x, y], i) => [i ? "L" : "M", x, y]), {
    name: "chart-line", parent, stroke: MINT, sw: 6, effects: [{ type: "glow", radius: 16, intensity: 0.9, color: MINT }]
  });
  const [ex, ey] = pts[8];
  const dot = s.ellipse(22, LIME, { name: "chart-dot", parent, x: ex, y: ey, effects: [{ type: "glow", radius: 20, intensity: 1, color: LIME }] });
  return { area, line, dot };
}

const s3 = v.scene("S3", f(128), (s) => {
  s.backdrop({ colors: [INK2, INK2], opacity: 0.6, seed: 5 });
  s.glow(1300, { alpha: 0.14, x: -420, y: 40 });

  // The phone, tilted toward the copy, rising in on a spring and floating.
  const phone = s.group({ name: "phone", x: -430, y: 20, tx: { rotationY: 14, rotationX: 4, perspective: 2600 } });
  phone.enter({ from: { offsetY: 180, opacity: 0 }, at: 0, dur: f(22), ease: "spring(160,20,1)" });
  phone.animate({ rotationY: [0, -6] }, { at: 0, dur: f(127), ease: "inOut" });
  s.rect(460, 920, CARD, { name: "phone-body", parent: phone.id, r: 64, stroke: "rgba(167,243,208,0.28)", sw: 2, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 40, blur: 90, color: "rgba(0,0,0,0.6)" }] });
  s.rect(130, 30, "#020806", { parent: phone.id, r: 15, y: -420 });
  const savedLabel = s.text("Saved this month", { anchor: "left", size: 28, weight: 500, color: DIM });
  const saved = s.text("$1,284", { name: "saved", anchor: "left", size: 92, weight: 800, color: TEXT, tracking: -0.03, fill: KITE });
  saved.count({ from: 0, to: 1284, at: f(8), dur: f(50), prefix: "$", groupSeparator: ",", ease: "outExpo" });
  const delta = s.text("+18% vs last month", { anchor: "left", size: 28, weight: 600, color: MINT });
  delta.enter({ from: { offsetY: 10, opacity: 0 }, at: f(44), dur: f(10), ease: "out" });
  s.stack([savedLabel, saved, delta], { name: "saved-block", parent: phone.id, at: { x: -182, y: -275 }, anchor: "left", gap: 20, align: "start" });

  const chart = s.group({ name: "chart", parent: phone.id, y: -20 });
  s.rect(400, 250, "rgba(244,251,248,0.03)", { parent: chart.id, r: 24, y: -40, stroke: LINE });
  const { area, line, dot } = phoneChart(s, chart.id);
  line.draw({ at: f(12), dur: f(40), ease: EASE_IO });
  area.animate({ wipeProgress: [0, 1] }, { at: f(12), dur: f(40), ease: EASE_IO, mask: { direction: "left", softness: 0.02 } });
  dot.enter({ from: { scale: 0 }, at: f(50), dur: f(14), ease: "spring(200,12,1)" });
  dot.loop({ scale: [[0, 1], [0.5, 1.25, "inOut"], [1, 1, "inOut"]] }, f(30), { ease: "inOut" });

  // The goal card: a ring that fills to 78 percent.
  const goal = s.group({ name: "goal", parent: phone.id, y: 260 });
  goal.enter({ from: { offsetY: 30, opacity: 0 }, at: f(18), dur: f(14), ease: "out" });
  s.rect(400, 230, "rgba(244,251,248,0.04)", { parent: goal.id, r: 28, stroke: LINE });
  s.ellipse(140, null, { parent: goal.id, x: -105, stroke: "rgba(143,179,166,0.22)", sw: 14 });
  const ring = s.ellipse(140, null, { name: "goal-ring", parent: goal.id, x: -105, rotation: -90, stroke: LIME, sw: 14, shape: { lineCap: "round" } });
  // Held at 78% to the clip end: an "in" whose window ends mid-clip, so the
  // ring reads empty (not full) before it starts and stays at 78% after.
  ring.animate({ trimEnd: [[0, 0], [44 / 102, 0.78, EASE_IO], [1, 0.78, "linear"]] }, { at: f(26), dur: f(102) });
  const pct = s.text("0%", { parent: goal.id, x: -105, y: 0, mw: 0.1, size: 34, weight: 700, color: TEXT });
  pct.count({ from: 0, to: 78, at: f(26), dur: f(44), suffix: "%", ease: EASE_IO });
  const goalTitle = s.text("Lisbon trip", { anchor: "left", size: 28, weight: 600, color: TEXT });
  const goalSub = s.text("$1,560 of $2,000", { anchor: "left", size: 28, weight: 500, color: DIM });
  s.stack([goalTitle, goalSub], { parent: goal.id, at: { x: -10, y: -3 }, anchor: "left", gap: 8, align: "start" });

  // Round-ups pop out of the phone's edge and stack, then clear.
  const roundups = [["+$0.60", "Coffee", 26], ["+$0.35", "Lunch", 38], ["+$0.80", "Train", 50]].map(([amt, what, f0], i) => {
    const chip = s.pill(`${amt}  ·  ${what}`, { name: `roundup-${i}`, dot: MINT, shadow: true, fillColor: "#133329", at: f(f0), dur: f(122 - f0) });
    chip.enter({ from: { scale: 0.5, offsetX: -90, opacity: 0 }, at: 0, dur: f(14), ease: "spring(220,14,1)" });
    chip.animate({ opacity: [1, 0], offsetY: [0, -20] }, { at: f(78 + i * 3), dur: f(10), ease: "in" });
    return chip;
  });
  s.stack(roundups, { at: { x: -120, y: -66 }, gap: 24 });

  // The copy on the right: a kicker over a two-line headline, one flush-left column.
  const kicker = s.kicker("How it works", { at: f(6) });
  const h1 = s.text("Every purchase", { anchor: "left", size: 76, weight: 700, font: DISPLAY, tracking: -0.035 });
  h1.enter({ from: { offsetY: 40, opacity: 0 }, at: f(10), dur: f(14), ease: "out", by: "word", staggerMs: 90 });
  const h2 = s.text("rounds up to savings.", { anchor: "left", size: 76, weight: 700, font: DISPLAY, tracking: -0.035, fill: KITE });
  h2.enter({ from: { offsetY: 40, opacity: 0 }, at: f(16), dur: f(14), ease: "out", by: "word", staggerMs: 90 });
  s.stack([kicker, h1, h2], { at: { x: 110, y: -212 }, anchor: "left", gap: 24, align: "start" });
  ["Round-ups on every card", "Goals that fund themselves", "Weekly insights, no spreadsheets"].forEach((label, i) => {
    const rowY = 40 + i * 92;
    // The checkmark's icon: an ellipse plus a drawn path, grouped so the pair
    // sizes as one flex leaf — its box is their union.
    const iconGroup = s.group({ name: `feature-${i}-icon` });
    const icon = s.ellipse(52, "rgba(52,211,153,0.16)", { parent: iconGroup.id, x: 26, stroke: "rgba(52,211,153,0.5)", sw: 1.5 });
    const check = s.path([["M", 14, 1], ["L", 23, 10], ["L", 39, -9]], { parent: iconGroup.id, stroke: MINT, sw: 4 });
    check.draw({ at: f(50 + i * 8), dur: f(10), ease: "out" });
    const label_ = s.text(label, { anchor: "left", size: 36, weight: 500, color: TEXT });
    // Each row is its own flex root (no flex ancestor), so it needs its own
    // `at` — a flex root's position is never composed through a plain,
    // non-flex wrapper group's own transform the way ordinary nested clips
    // are, so three rows previously nested under three separately-positioned
    // (but non-flex) wrapper groups all resolved to the same box. row()
    // returns an ordinary group clip, so the wrapper bought nothing that
    // `at` plus `.enter()` on the row itself doesn't already give.
    const featureRow = s.row([iconGroup, label_], { at: { x: 110, y: rowY }, anchor: "left", align: "center", gap: 26 });
    featureRow.enter({ from: { offsetX: 40, opacity: 0 }, at: f(42 + i * 8), dur: f(14), ease: "out" });
  });
});

// ---------------------------------------------------------------------------
// S4 Growth (282-385, runs under the gradient wipe into S5)

const s4 = v.scene("S4", f(103), (s) => {
  s.backdrop({ colors: [INK2, INK2], opacity: 0.8, seed: 7 });
  const cam = s.group({ name: "chart-rig", tx: { rotationX: 10, perspective: 2800 } });
  cam.animate({ scale: [1, 1.06] }, { at: 0, dur: f(103), ease: "linear" });
  const n = 12, bw = 70, gap = 30, base = 330;
  const x0 = -((n * bw + (n - 1) * gap) / 2) + bw / 2;
  for (let k = 0; k < 4; k++) s.rect(n * bw + (n - 1) * gap + 60, 2, "rgba(143,179,166,0.14)", { parent: cam.id, y: base - k * 120 });
  const months = "JFMAMJJASOND";
  let lastTop = 0;
  for (let i = 0; i < n; i++) {
    const h = Math.round(70 + 330 * Math.pow(i / (n - 1), 1.35) + (hash(i + 40) - 0.5) * 50);
    const x = x0 + i * (bw + gap);
    const bar = s.rect(bw, h, KITE_UP, { name: `bar-${i}`, parent: cam.id, x, y: base - h / 2, r: 12, effects: i === n - 1 ? [{ type: "glow", radius: 30, intensity: 0.9, color: LIME }] : undefined });
    bar.animate({ scaleY: [0, 1], offsetY: [h / 2, 0] }, { at: f(10 + i * 2.5), dur: f(18), ease: "spring(170,17,1)" });
    const lbl = s.text(months[i], { parent: cam.id, x, y: base + 34, mw: 0.03, size: 28, weight: 600, color: DIM });
    lbl.enter({ from: { offsetY: 10, opacity: 0 }, at: f(6 + i * 2), dur: f(8), ease: "out" });
    if (i === n - 1) lastTop = base - h;
  }
  const callout = s.pill("+$420 in December", { name: "callout", parent: cam.id, x: x0 + (n - 1) * (bw + gap) - 110, y: lastTop - 70, fillColor: LIME, color: INK, stroke: "rgba(0,0,0,0)" });
  callout.enter({ from: { scale: 0.4, offsetY: 30, opacity: 0 }, at: f(52), dur: f(14), ease: "spring(220,14,1)" });

  const growKicker = s.kicker("Set it once", { at: f(4) });
  const head = s.text("Watch it grow.", { anchor: "left", size: 104, weight: 700, font: DISPLAY, tracking: -0.04 });
  head.enter({ from: { offsetY: 40, opacity: 0 }, at: f(8), dur: f(14), ease: "out", by: "word", staggerMs: 100 });
  s.stack([growKicker, head], { at: { x: -700, y: -355 }, anchor: "left", gap: 24, align: "start" });

  const total = s.text("$3,650", { name: "year-total", anchor: "right", size: 120, weight: 800, color: TEXT, tracking: -0.035, fill: KITE });
  total.enter({ from: { offsetY: 20, opacity: 0 }, at: f(10), dur: f(10), ease: "out" });
  total.count({ from: 0, to: 3650, at: f(10), dur: f(62), prefix: "$", groupSeparator: ",", ease: EASE_OUT });
  const sub = s.text("saved in year one", { anchor: "right", size: 30, weight: 500, color: DIM });
  sub.enter({ from: { offsetY: 14, opacity: 0 }, at: f(20), dur: f(12), ease: "out" });
  s.stack([total, sub], { at: { x: 700, y: -278 }, anchor: "right", gap: 8, align: "end" });
});

// ---------------------------------------------------------------------------
// S5 End card (376-449)

const s5 = v.scene("S5", f(74), (s) => {
  s.backdrop({ colors: ["#0f3b2e", INK2], opacity: 0.9, seed: 9 });
  const g = s.glow(1200, { alpha: 0.26, y: -40 });
  g.loop({ scale: [[0, 1], [0.5, 1.06, "inOut"], [1, 1, "inOut"]] }, f(60), { ease: "inOut" });
  const logo = s.group({ name: "end-logo", y: -150 });
  logo.animate({ scale: [1.18, 1] }, { at: 0, dur: f(22), ease: "outExpo" });
  logo.animate({ opacity: [0, 1] }, { at: 0, dur: f(6), ease: "linear" });
  mark(s, LOGO.markX, -20, null, logo.id);
  wordmark(s, LOGO.wordX, 0, null, logo.id);
  const tag = s.text("Savings on autopilot.", { y: 95, font: DISPLAY, size: 68, weight: 700, color: TEXT, tracking: -0.03, fill: KITE });
  tag.enter({ from: { offsetY: 24, opacity: 0 }, at: f(8), dur: f(14), ease: "out" });
  const cta = s.pill("Free on iOS & Android", { name: "cta", y: 210, fillColor: TEXT, color: INK, stroke: "rgba(0,0,0,0)", padX: 40 });
  cta.enter({ from: { offsetY: 40, opacity: 0 }, at: f(18), dur: f(16), ease: "spring(180,20,1)" });
  const leak = s.rect(W, H, null, { name: "light-leak", dur: f(16), blendMode: "screen", effects: [{ type: "generator", mode: "lightLeak", colorA: LIME, colorB: MINT, seed: 3, animate: true, amount: 1 }] });
  leak.animate({ opacity: [[0, 0], [0.4, 0.55, "out"], [1, 0, "in"]] }, { at: 0, dur: f(16) });
  s.flash({ at: 0, dur: f(8), peak: 0.6 });
});
// This scene's own group fades out at its own end.
s5.group.animations = [{ id: "s5-fade", role: "out", preset: "custom", delayMs: 0, durationMs: Math.round(f(12) * 1000), custom: { curves: [{ property: "opacity", keyframes: [{ t: 0, value: 1 }, { t: 1, value: 0, easing: "easeIn" }] }] } }];

// ---------------------------------------------------------------------------
// Assembly
//
// A hard cut S1 -> S2, then a whip, a gradient wipe and an iris carry S3, S4
// and S5 into each other, each overlapping its predecessor by its own
// duration.

v.series([
  s1,
  s2,
  v.transition("whip", 0.25, { direction: "right", easing: "easeInOut" }),
  s3,
  v.transition("gradientWipe", 0.35, { direction: "left", map: "noise", seed: 6, easing: "easeInOutExpo" }),
  s4,
  v.transition("iris", 0.3, { softness: 0.05, easing: "easeInOut" }),
  s5
]);

// The hard cut S1 -> S2 at frame 90 gets a glitch across frames 87-92.
const GLITCH = [0.3, 0.8, 1, 0.9, 0.5, 0.15];
v.adjust(
  [
    { id: "gx", type: "stylize", mode: "glitch", amount: 0, seed: 11, animate: true },
    { id: "rx", type: "stylize", mode: "rgbSplit", amount: 0 }
  ],
  {
    id: "glitch-join", name: "glitch 87-92", trackId: "t_glitch", at: f(87), dur: f(6),
    animations: [{
      id: "glitch-join-a", role: "in", preset: "custom", delayMs: 0, durationMs: Math.round(f(6) * 1000),
      custom: { curves: [{ property: "opacity", keyframes: [{ t: 0, value: 1 }, { t: 1, value: 1, easing: "linear" }] }] },
      styleTracks: [
        { target: "effect.gx.amount", keyframes: GLITCH.map((value, i) => ({ t: i / (GLITCH.length - 1), value, easing: "linear" })) },
        { target: "effect.rx.amount", keyframes: GLITCH.map((value, i) => ({ t: i / (GLITCH.length - 1), value: value * 18, easing: "linear" })) }
      ]
    }]
  }
);

// The scene-finishing grain, dither and vignette, across the whole video.
v.adjust(
  [
    { type: "vignette", amount: 0.25, softness: 0.7 },
    { type: "grain", amount: 0.04, animate: true, seed: 1 },
    { type: "stylize", mode: "dither", amount: 1, seed: 7 }
  ],
  { id: "finish", name: "grain + dither", trackId: "t_finish" }
);

// A slow push through the logo scene.
v.document({
  camera2d: {
    position: { x: 0, y: 0 }, depthPx: 0, focalLengthPx: 1800,
    keyframes: [
      { timeMs: 0, position: { x: 0, y: 0 }, depthPx: 0 },
      { timeMs: Math.round(f(90) * 1000), position: { x: 0, y: 0 }, depthPx: 0 },
      { timeMs: Math.round(f(164) * 1000), position: { x: 0, y: -10 }, depthPx: 90 },
      { timeMs: Math.round(f(165) * 1000), position: { x: 0, y: 0 }, depthPx: 0 }
    ]
  }
});

const saved = await v.save(nodetool.timelines, {
  name: "Kite — Savings on autopilot",
  showcase: true
});
await output("timeline", {
  name: "Kite — Savings on autopilot",
  description: "A 15-second app ad made from motion graphics alone: kinetic type, a drawn-on chart, a filling goal ring, and a logo reveal.",
  videoUri: "package://nodetool-base/timelines/kite/ad.mp4",
  posterUri: "package://nodetool-base/timelines/kite/poster.jpg",
  ...saved
});
