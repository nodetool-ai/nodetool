// Cadence: a 19-second vertical year-in-review for a fictional city
// bike-share, told as a data story on paper instead of an ad on black.
//
// `node scripts/example-timelines/build.mjs cadence` writes the shipped bundle
// packages/base-nodes/nodetool/examples/timelines/cadence.timeline.json.
// `node scripts/render-example-timeline.mjs cadence` renders its video and poster.
//
// Every number on screen is fictional. Every time value below is seconds,
// local to the scene (or `seq`) that authored it — `v.series()` is the only
// place a scene's position in the whole video is decided. Positions are px
// from the frame centre on a 1080×1920 frame.
//
// Coverage. Mostly features no other shipped example uses.
//
// | Feature | Clip | Scene |
// |---|---|---|
// | 9:16 frame, light editorial palette | every scene | S1–S6 |
// | `repeater` street grid | `streets-v`, `streets-h` | S1 |
// | `expr()` motion along a route, `noise()` wobble | `rider` | S1 |
// | `s.stagger()` over existing clips | `dock-*`, legend rows | S1, S5 |
// | `component()` + `s.use()` | `StatCard` ×3 | S2 |
// | `s.statCounter()` | `rides-total`, `share` | S2, S5 |
// | `s.barChart()` with a highlight | `months` | S3 |
// | `s.areaChart()` | `hours` | S4 |
// | `s.seq()` nested clock for annotations | `rush-*` | S4 |
// | `s.donut()` with a custom centre | `purpose` | S5 |
// | Nested `row`s inside a `stack` | `legend` | S5 |
// | `push`, `slide`, `wipe`, `zoom`, `crossfade` transitions | — | joins |
import { video, component } from "@nodetool-ai/sandbox-timeline";

const W = 1080, H = 1920, FPS = 30;

const PAPER = "#f2ede3", PAPER2 = "#e6dccb", CARD = "#fbf8f2";
const INK = "#15171c", DIM = "#6d6a62", LINE = "rgba(21,23,28,0.12)";
const SIGNAL = "#ff4f1a", COBALT = "#2443d6", SUN = "#f5b82e";
// Text versions of the two warm accents, dark enough to read on paper and card.
const SIGNAL_TEXT = "#d63a0a", SUN_TEXT = "#9a6b00";
const SERIF = "serif", MONO = "mono";
const EASE_IO = "cubic-bezier(0.65,0,0.35,1)";
const SPRING = "spring(190,18,1)";
const MARGIN = -440; // the left edge of every flush-left column

const v = video({
  width: W, height: H, fps: FPS,
  palette: { ink: PAPER, ink2: PAPER2, text: INK, dim: DIM, accent: SIGNAL },
  fonts: { display: "Inter", serif: "Lora", body: "Inter", mono: "JetBrains Mono" }
});

/** The chart helpers draw their own labels in light text; this paper needs ink. */
function inkText(els, color) {
  for (const el of els) if (el) el.textStyle.color = color;
}

/** The point at fraction `p` of a polyline's arc length, and the polyline's length. */
function along(pts, p) {
  const seg = pts.slice(1).map((b, i) => Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  let left = Math.min(1, Math.max(0, p)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? left / seg[i] : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    left -= seg[i];
  }
  return pts[pts.length - 1];
}

/** A serif headline in two lines, rising in word by word. */
function headline(s, lines, o) {
  const { at = 0.2, size = 92, accentLine = 1 } = o;
  return lines.map((line, i) => {
    const t = s.text(line, { anchor: "left", font: SERIF, size, weight: 600, italic: i === accentLine, color: i === accentLine ? SIGNAL_TEXT : INK, tracking: -0.02 });
    t.enter({ from: { offsetY: 36, opacity: 0 }, at: at + i * 0.12, dur: 0.5, ease: "outExpo", by: "word", staggerMs: 70 });
    return t;
  });
}

/**
 * The kicker, a two-line headline under it, placed as one column at the top
 * margin. `stretch` gives every line the full column width, so each line sets
 * centred on it. A line sized to its own measured width can wrap its last word
 * by a sub-pixel difference.
 */
function header(s, kicker, lines, o = {}) {
  const k = s.kicker(kicker, { at: 0.05, font: MONO, size: 32, color: DIM, mw: 0.85 });
  const h = headline(s, lines, o);
  return s.stack([k, ...h], { at: { x: MARGIN, y: o.y ?? -760 }, anchor: "top-left", gap: 14, align: "stretch", width: 900 });
}

// ---------------------------------------------------------------------------
// The stat card: a reusable piece with typed props, used three times in S2.

const StatCard = component("StatCard", {
  props: {
    label: { type: "string", default: "Average ride" },
    value: { type: "number", default: 14.2 },
    decimals: { type: "number", default: 0 },
    suffix: { type: "string", default: "" },
    note: { type: "string", default: "" },
    tone: { type: "color", default: SIGNAL }
  },
  duration: 2
}, (s, p) => {
  s.rect(880, 190, CARD, { name: "plate", r: 30, stroke: LINE, sw: 2, effects: [{ type: "dropShadow", offsetX: 0, offsetY: 14, blur: 36, color: "rgba(21,23,28,0.10)" }] });
  const bar = s.rect(10, 104, p.tone, { name: "tone-bar", r: 5, x: -392 });
  bar.animate({ scaleY: [0, 1] }, { at: 0.15, dur: 0.4, ease: "outExpo" });
  s.text(p.label.toUpperCase(), { name: "label", anchor: "left", mw: 0.5, x: -356, y: -42, font: MONO, size: 28, weight: 500, color: DIM, tracking: 0.08 });
  const value = s.text("0", { name: "value", anchor: "left", mw: 0.5, x: -358, y: 30, size: 76, weight: 700, color: INK, tracking: -0.03 });
  value.count({ from: 0, to: p.value, at: 0.1, dur: 0.9, decimals: p.decimals, suffix: p.suffix, groupSeparator: ",", ease: "outExpo" });
  if (p.note) s.text(p.note, { name: "note", anchor: "right", mw: 0.3, x: 400, y: 34, font: MONO, size: 30, weight: 500, color: p.tone === SUN ? SUN_TEXT : p.tone });
});

// ---------------------------------------------------------------------------
// S1 The map: a route draws itself across a street grid while a rider rides it.

const ROUTE = [[-380, 300], [-380, 20], [-140, 20], [-140, -260], [140, -260], [140, -500], [380, -500], [380, -780]];

const s1 = v.scene("S1", 3.2, (s) => {
  s.backdrop({ colors: [PAPER, PAPER2], opacity: 0.5, seed: 4 });

  // The grid is two lines, each repeated across the frame.
  // The map sits deeper than the headline, so the camera push in S1 moves them apart.
  const map = s.group({ name: "map", tx: { rotationX: 18, perspective: 3000, depthPx: 320 } });
  map.animate({ scale: [1.12, 1], rotation: [-4, 0] }, { at: 0, dur: 3.2, ease: "out" });
  const vLines = s.rect(3, H * 1.3, LINE, { name: "streets-v", parent: map.id, x: -600, repeater: { count: 11, positionStep: { x: 120, y: 0 }, timeStepMs: 40 } });
  vLines.enter({ from: { opacity: 0 }, at: 0, dur: 0.4 });
  const hLines = s.rect(W * 1.3, 3, LINE, { name: "streets-h", parent: map.id, y: -1080, repeater: { count: 19, positionStep: { x: 0, y: 120 }, timeStepMs: 30 } });
  hLines.enter({ from: { opacity: 0 }, at: 0.1, dur: 0.4 });
  const park = s.rect(220, 220, "rgba(36,67,214,0.10)", { name: "park", parent: map.id, x: 20, y: 160, r: 16 });
  park.enter({ from: { scale: 0.6, opacity: 0 }, at: 0.3, dur: 0.5, ease: "outExpo" });

  // Docks pop in one after another along the grid.
  const docks = [[-380, 300], [-140, 20], [140, -260], [380, -500], [-260, -560], [260, 180]].map(([x, y], i) =>
    s.ellipse(30, CARD, { name: `dock-${i}`, parent: map.id, x, y, stroke: INK, sw: 4 })
  );
  s.stagger(docks, 0.12, (d) => d.enter({ from: { scale: 0, opacity: 0 }, dur: 0.35, ease: SPRING }));

  // The route and its rider share one clock: a linear draw and a linear ride.
  const RIDE_AT = 0.4, RIDE_DUR = 2.2;
  const route = s.path(ROUTE.map(([x, y], i) => [i ? "L" : "M", x, y]), { name: "route", parent: map.id, stroke: SIGNAL, sw: 12, shape: { lineCap: "round", lineJoin: "round" } });
  route.draw({ at: RIDE_AT, dur: RIDE_DUR, ease: "linear" });
  const [x0, y0] = ROUTE[0];
  const rider = s.ellipse(44, SIGNAL, { name: "rider", parent: map.id, x: x0, y: y0, stroke: CARD, sw: 8, effects: [{ type: "glow", radius: 26, intensity: 0.8, color: SIGNAL }] });
  const wobble = s.noise(11);
  rider.expr((t, { p }) => {
    const [x, y] = along(ROUTE, (t - RIDE_AT) / RIDE_DUR);
    return { offsetX: x - x0, offsetY: y - y0, scale: 1 + (wobble(p * 9) - 0.5) * 0.18 };
  }, { at: 0, dur: 3.2 });

  const k = s.kicker("Cadence · 2026 in review", { at: 0.2, font: MONO, size: 32, color: INK, mw: 0.85 });
  const lines = headline(s, ["Our city,", "by the pedal."], { at: 0.9, size: 112 });
  s.stack([k, ...lines], { at: { x: MARGIN, y: 860 }, anchor: "bottom-left", gap: 16, align: "stretch", width: 900 });
});

// ---------------------------------------------------------------------------
// S2 The big number, and three cards that put it in proportion.

const s2 = v.scene("S2", 3.2, (s) => {
  s.backdrop({ colors: [PAPER, PAPER2], opacity: 0.5, seed: 6 });
  const k = s.kicker("Rides taken this year", { at: 0.1, font: MONO, size: 32, color: DIM, mw: 0.85 });
  const total = s.statCounter(4218306, { name: "rides-total", anchor: "left", size: 156, weight: 700, color: INK, tracking: -0.045, at: 0.15, dur: 1.4, format: { groupSeparator: "," } });
  total.enter({ from: { offsetY: 40, blur: 16 }, at: 0.15, dur: 0.5, ease: "outExpo" });
  total.tween("text.color", [[0, SIGNAL_TEXT], [1, INK, "in"]], { at: 0.15, dur: 1.4 });
  const rule = s.rect(880, 6, SIGNAL, { name: "rule", r: 3 });
  rule.enter({ from: { scaleX: 0, offsetX: -440 }, at: 0.5, dur: 0.6, ease: EASE_IO });
  s.stack([k, total, rule], { at: { x: MARGIN, y: -560 }, anchor: "left", gap: 20, align: "start" });

  const cards = [
    { label: "Average ride", value: 14.2, decimals: 1, suffix: " min", note: "door to dock", tone: SIGNAL },
    { label: "CO₂ kept out of the air", value: 1180, suffix: " t", note: "vs. driving", tone: COBALT },
    { label: "First-time riders", value: 86400, note: "+31%", tone: SUN }
  ];
  cards.forEach((props, i) => {
    const card = s.use(StatCard, props, { name: `card-${i}`, x: 0, y: -10 + i * 236, at: 0.6 + i * 0.18, dur: 2.6 - i * 0.18 });
    card.enter({ from: { offsetX: 120, opacity: 0 }, at: 0, dur: 0.5, ease: SPRING });
  });

  const foot = s.text("One ride every 7.5 seconds, all year.", { name: "footnote", anchor: "left", mw: 0.82, x: MARGIN, y: 720, font: SERIF, italic: true, size: 48, weight: 500, color: INK });
  foot.enter({ from: { offsetY: 20, opacity: 0 }, at: 1.4, dur: 0.5, ease: "outExpo", by: "word", staggerMs: 40 });
});

// ---------------------------------------------------------------------------
// S3 Rides by month: one bar chart, July called out.

const MONTHS = [182, 196, 268, 331, 402, 455, 498, 486, 421, 344, 241, 194];

const s3 = v.scene("S3", 3.4, (s) => {
  s.backdrop({ colors: [PAPER, PAPER2], opacity: 0.5, seed: 8 });
  header(s, "Rides per month", ["Summer never", "slowed down."]);

  const CW = 900, CH = 680, CY = 230;
  for (let i = 0; i < 4; i++) {
    const grid = s.rect(CW, 2, LINE, { name: `grid-${i}`, y: CY + CH / 2 - i * (CH / 3.5) });
    grid.enter({ from: { scaleX: 0 }, at: 0.2 + i * 0.05, dur: 0.5, ease: "outExpo" });
  }
  const chart = s.barChart(MONTHS.map((value, i) => ({ value, label: "JFMAMJJASOND"[i] })), {
    name: "months", w: CW, h: CH, y: CY, gap: 14, rounded: 10, at: 0.45, stagger: 0.06, dur: 0.6,
    labels: false, highlight: 6, color: SIGNAL, palette: ["#cdc3b1"], ease: SPRING
  });
  inkText(chart.dataLabels, DIM);
  // July warms from the neutral bars into the signal colour as its callout lands.
  chart.bars[6].shapeStyle.fill = "#cdc3b1";
  chart.bars[6].tween("shape.fill", [[0, "#cdc3b1"], [1, SIGNAL, "out"]], { at: 1.0, dur: 0.5 });
  for (const l of chart.dataLabels) Object.assign(l.textStyle, { fontFamily: "JetBrains Mono", fontSizePx: 30 });

  // July's bar is the tallest, so its top sits at the top of the chart box.
  const thick = (CW - 14 * 11) / 12;
  const julyX = -CW / 2 + thick / 2 + 6 * (thick + 14);
  const call = s.pill("July · 498k rides", { name: "july", x: julyX, y: CY - CH / 2 - 70, fillColor: INK, color: PAPER, stroke: "rgba(0,0,0,0)", size: 30, at: 1.3, dur: 2.1 });
  call.enter({ from: { scale: 0.5, offsetY: 30, opacity: 0 }, at: 0, dur: 0.45, ease: SPRING });
  call.loop({ offsetY: [[0, 0], [0.5, -8, "inOut"], [1, 0, "inOut"]] }, 1.2);
});

// ---------------------------------------------------------------------------
// S4 Rides by hour: an area chart with two rush hours annotated on their own clock.

const HOURS = [4, 2, 1, 1, 2, 8, 26, 62, 88, 54, 38, 42, 50, 46, 40, 48, 70, 92, 74, 46, 30, 20, 12, 7];

const s4 = v.scene("S4", 3.4, (s) => {
  s.backdrop({ colors: [PAPER, "#dfe3f0"], opacity: 0.55, seed: 10 });
  header(s, "Rides by hour", ["Twice a day,", "the city moves."], { accentLine: 1 });

  const CW = 900, CH = 560, CY = 260;
  const base = s.rect(CW, 3, INK, { name: "baseline", y: CY + CH / 2 });
  base.enter({ from: { scaleX: 0 }, at: 0.2, dur: 0.5, ease: "outExpo" });
  const area = s.areaChart(HOURS, { name: "hours", w: CW, h: CH, y: CY, color: COBALT, sw: 6, at: 0.4, dur: 1.1, ease: EASE_IO });
  area.line.shapeStyle.lineJoin = "round";
  ["12 AM", "6 AM", "NOON", "6 PM", "12 AM"].forEach((label, i) => {
    const t = s.text(label, { name: `hour-${i}`, x: -CW / 2 + (i * CW) / 4, y: CY + CH / 2 + 44, mw: 0.2, font: MONO, size: 28, weight: 500, color: DIM });
    t.enter({ from: { opacity: 0, offsetY: 10 }, at: 0.3 + i * 0.05, dur: 0.4 });
  });

  // The annotations live on their own clock, 1.3s in — retime them by moving one number.
  const min = Math.min(...HOURS), span = Math.max(...HOURS) - min;
  const peak = (hour) => [-CW / 2 + (hour / 23) * CW, CY + CH / 2 - ((HOURS[hour] - min) / span) * CH];
  s.seq(1.3, 2.1, (q) => {
    [[8, "8 AM rush", -230], [17, "5 PM rush", -300]].forEach(([hour, label, labelY], i) => {
      const [px, py] = peak(hour);
      const at = i * 0.25;
      const stem = q.rect(3, py - labelY, INK, { name: `rush-${i}-stem`, x: px, y: (py + labelY) / 2 });
      stem.enter({ from: { scaleY: 0, offsetY: (py - labelY) / 2 }, at, dur: 0.35, ease: "outExpo" });
      const dot = q.ellipse(26, CARD, { name: `rush-${i}-dot`, x: px, y: py, stroke: COBALT, sw: 6 });
      dot.enter({ from: { scale: 0 }, at, dur: 0.35, ease: SPRING });
      const tag = q.pill(label, { name: `rush-${i}`, x: px, y: labelY - 30, fillColor: COBALT, color: CARD, stroke: "rgba(0,0,0,0)", size: 28, at: at + 0.15, dur: 2.1 - at - 0.15 });
      tag.enter({ from: { offsetY: 24, scale: 0.7, opacity: 0 }, at: 0, dur: 0.4, ease: SPRING });
    });
  });
});

// ---------------------------------------------------------------------------
// S5 Why people ride: a donut, a counted centre, a legend of nested rows.

const PURPOSE = [
  { value: 46, label: "Commute", color: SIGNAL },
  { value: 22, label: "Errands", color: COBALT },
  { value: 19, label: "Leisure", color: SUN },
  { value: 13, label: "School", color: INK }
];

const s5 = v.scene("S5", 3.4, (s) => {
  s.backdrop({ colors: [PAPER, PAPER2], opacity: 0.5, seed: 12 });
  header(s, "Why we ride", ["Mostly, to get", "somewhere."]);

  const DY = -40;
  const ring = s.donut(PURPOSE, { name: "purpose", d: 560, thickness: 92, gap: 3, y: DY, at: 0.35, dur: 0.7, stagger: 0.14, palette: PURPOSE.map((p) => p.color), centerLabel: false, ease: EASE_IO });
  ring.group.animate({ rotation: [-30, 0] }, { at: 0.35, dur: 1.2, ease: "outExpo" });
  const share = s.statCounter(46, { name: "share", y: DY - 20, size: 132, weight: 700, color: INK, tracking: -0.04, at: 0.4, dur: 0.9, format: { suffix: "%" } });
  share.enter({ from: { scale: 0.8 }, at: 0.4, dur: 0.5, ease: SPRING });
  const cap = s.text("ride to work", { name: "share-caption", y: DY + 66, font: SERIF, italic: true, size: 48, weight: 500, color: DIM });
  cap.enter({ from: { opacity: 0, offsetY: 12 }, at: 0.9, dur: 0.4 });

  const rows = PURPOSE.map((p, i) => {
    const dot = s.rect(34, 34, p.color, { name: `legend-${i}-swatch`, r: 6 });
    const label = s.text(p.label, { name: `legend-${i}-label`, anchor: "left", size: 48, weight: 500, color: INK, flexItem: { grow: 1 } });
    const pct = s.text(`${p.value}%`, { name: `legend-${i}-pct`, anchor: "right", font: MONO, size: 48, weight: 500, color: DIM });
    return s.row([dot, label, pct], { name: `legend-${i}`, align: "center", gap: 26, width: 600 });
  });
  s.stack(rows, { name: "legend", at: { x: 0, y: 580 }, anchor: "center", gap: 26 });
  s.stagger(rows, 0.09, (r) => r.enter({ from: { offsetX: -40, opacity: 0 }, at: 0.9 + r._staggerAt, dur: 0.45, ease: "outExpo" }));
});

// ---------------------------------------------------------------------------
// S6 End card: the wheel mark spins up, the wordmark sets letter by letter.

const s6 = v.scene("S6", 2.8, (s) => {
  s.backdrop({ colors: [PAPER, PAPER2], opacity: 0.6, seed: 14 });
  const glow = s.glow({ size: 1300, alpha: 0.16, color: SIGNAL, y: -180 });
  glow.loop({ scale: [[0, 1], [0.5, 1.08, "inOut"], [1, 1, "inOut"]] }, 2.4);

  const wheel = s.group({ name: "wheel", y: -260 });
  wheel.enter({ from: { scale: 0.4, opacity: 0, rotation: -120 }, at: 0, dur: 0.7, ease: SPRING });
  const spokes = s.group({ name: "spokes", parent: wheel.id });
  spokes.loop({ rotation: [0, 360] }, 1.6);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    s.path([["M", 0, 0], ["L", Math.cos(a) * 118, Math.sin(a) * 118]], { name: `spoke-${i}`, parent: spokes.id, stroke: INK, sw: 6 });
  }
  const rim = s.ellipse(260, null, { name: "rim", parent: wheel.id, stroke: INK, sw: 16 });
  rim.draw({ at: 0.05, dur: 0.6, ease: EASE_IO });
  s.ellipse(54, SIGNAL, { name: "hub", parent: wheel.id, stroke: CARD, sw: 8 });

  const word = s.text("cadence", { name: "wordmark", y: 0, font: SERIF, italic: true, size: 176, weight: 600, color: INK, tracking: -0.03 });
  word.enter({ from: { offsetY: 50, opacity: 0, blur: 10 }, at: 0.35, dur: 0.5, ease: "outExpo", by: "character", staggerMs: 45 });
  word.tween("glyph.color", [[0, SIGNAL_TEXT], [1, INK, "in"]], { at: 0.35, dur: 0.9 });
  const tag = s.text("Ride your year.", { name: "tagline", y: 140, size: 56, weight: 600, color: SIGNAL_TEXT, tracking: -0.01 });
  tag.enter({ from: { offsetY: 24, opacity: 0 }, at: 0.8, dur: 0.45, ease: "outExpo" });
  const cta = s.pill("Your 2026 recap is in the app", { name: "cta", y: 330, fillColor: INK, color: PAPER, stroke: "rgba(0,0,0,0)", size: 40, padX: 52 });
  cta.enter({ from: { offsetY: 40, opacity: 0 }, at: 1.0, dur: 0.6, ease: SPRING });
});

// ---------------------------------------------------------------------------
// Assembly. Each join moves the page a different way, as if turning a report.

v.series([
  s1,
  v.transition("push", 0.35, { direction: "up", easing: "easeInOutExpo" }),
  s2,
  v.transition("slide", 0.3, { direction: "left", easing: "easeOutExpo" }),
  s3,
  v.transition("wipe", 0.3, { direction: "up", softness: 0.1, easing: "easeInOut" }),
  s4,
  v.transition("zoom", 0.3, { easing: "easeInOutExpo" }),
  s5,
  v.transition("crossfade", 0.35, { easing: "easeInOut" }),
  s6
]);

// Paper finish across the whole video: a little grain and a soft edge.
v.adjust(
  [
    { type: "vignette", amount: 0.12, softness: 0.8 },
    { type: "grain", amount: 0.035, animate: true, seed: 2 },
    { type: "color", saturation: 1.06, contrast: 1.04 }
  ],
  { id: "finish", name: "paper finish", trackId: "t_finish" }
);

// A slow push and rise through the map in S1, then back to rest for S2.
v.document({
  camera2d: {
    position: { x: 0, y: 0 }, depthPx: 0, focalLengthPx: 1800,
    keyframes: [
      { timeMs: 0, position: { x: 0, y: 0 }, depthPx: 0 },
      { timeMs: 3150, position: { x: 30, y: -60 }, depthPx: 160 },
      { timeMs: 3200, position: { x: 0, y: 0 }, depthPx: 0 }
    ]
  }
});

const saved = await v.save(nodetool.timelines, {
  name: "Cadence — A year on two wheels",
  showcase: true
});
await output("timeline", {
  name: "Cadence — A year on two wheels",
  description: "A vertical year-in-review data story: a route that rides itself, counted stat cards, and bar, area and donut charts on paper.",
  videoUri: "package://nodetool-base/timelines/cadence/ad.mp4",
  posterUri: "package://nodetool-base/timelines/cadence/poster.jpg",
  ...saved
});
