/**
 * Chart components for the timeline authoring API. Motion graphics are often
 * data — a growth bar, a balance draining, a share of a whole — so a chart
 * built from the same shapes and text everything else uses composes with the
 * rest of a scene: parent it, stagger it, put a `kicker`/`pill` beside it.
 *
 * Pure functions over the public scene API (`s.rect`, `s.text`, `s.path`,
 * `s.ellipse`, `s.group`) — no access to `index.js`'s own closures (`nid`,
 * `msFor`, `W`/`H`), so a chart needs nothing from the entry module beyond
 * `s` itself, and it composes with anything `s` can already do (parenting,
 * layout containers once those land).
 *
 * Every chart returns `{ group, ...pieces }`. `group` is the container clip
 * — move it, parent it, `beside()` it like any other clip. The pieces
 * (`bars`, `line`, `dots`, `segments`, `label`, …) are the real shapes and
 * text a caller might want to touch individually; they are already in the
 * document (each was made through `s.rect`/`s.text`/`s.path`), so the
 * returned object is bookkeeping, not something that itself gets saved.
 */

const DEFAULT_COLOR = "#34d399";
const DEFAULT_DIM = "#8fb3a6";
const rad = (deg) => (deg * Math.PI) / 180;

function values(data) {
  return data.map((d) => (typeof d === "number" ? d : d.value));
}
function labelsOf(data) {
  return data.map((d) => (typeof d === "number" ? null : d.label ?? null));
}
function fmt(value, o = {}) {
  const { decimals = 0, prefix = "", suffix = "" } = o;
  const n = Number((value ?? 0).toFixed(decimals));
  return `${prefix}${decimals > 0 ? n.toFixed(decimals) : Math.round(n)}${suffix}`;
}
/** `#rrggbb` + alpha -> `rgba(...)`, for a chart's own gradient fills. */
function hexA(hex, alpha) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
/** `[number, ...]` or `[{x, y}, ...]` into `{x?: 0..1, y}` points, evenly spaced when `x` is absent. */
function seriesPoints(series) {
  return series.map((d, i) =>
    typeof d === "number" ? { y: d } : d
  ).map((p, i, arr) => ({
    x: p.x !== undefined ? p.x : i / Math.max(1, arr.length - 1),
    y: p.y
  }));
}

/**
 * `barChart(s, data, o)` — bars grow from the baseline (`scaleY`/`offsetY`,
 * the same idiom every hand-authored growth bar in the shipped examples
 * uses), staggered across the set, each with a value label that counts up
 * and finishes inside its own bar's growth window — so a still taken any
 * time after `at + i * stagger + dur` shows a settled bar and a settled
 * number, never a mid-flight one.
 *
 * `data`: `[number, ...]` or `[{value, label}, ...]`.
 * `o`: `w`, `h` (box size, px), `orientation` `"vertical"|"horizontal"`,
 * `gap` (px between bars), `rounded` (corner radius), `labels` (value
 * labels on/off, default true), `axisLabels` (the `label` strings on/off,
 * default true), `stagger` (seconds between bars), `at`, `dur`, `ease`,
 * `highlight` (index drawn in `color` instead of `palette`), `color`,
 * `palette` (per-bar colors, cycled), `format` ({decimals, prefix,
 * suffix}), `x`, `y`, `parent`.
 */
export function barChart(s, data, o = {}) {
  const {
    w = 600,
    h = 360,
    gap = 16,
    orientation = "vertical",
    rounded = 8,
    labels = true,
    axisLabels = true,
    stagger = 0.07,
    at = 0,
    dur = 0.5,
    ease = "outExpo",
    highlight,
    color = DEFAULT_COLOR,
    dim = DEFAULT_DIM,
    palette = [],
    format = {},
    x = 0,
    y = 0,
    parent,
    name = "barChart"
  } = o;
  const g = s.group({ name, x, y, parent });
  const vals = values(data);
  const labelStrs = labelsOf(data);
  const n = vals.length;
  const max = Math.max(...vals, 0.0001);
  const vertical = orientation !== "horizontal";
  const axisLen = vertical ? w : h;
  const crossLen = vertical ? h : w;
  const thickness = Math.max(1, (axisLen - gap * Math.max(0, n - 1)) / n);
  const bars = [];
  const valueLabels = [];
  const dataLabels = [];
  vals.forEach((value, i) => {
    const frac = Math.max(0, value) / max;
    const len = Math.max(1, crossLen * frac);
    const isHi = i === highlight;
    const barColor = isHi ? color : palette[i % Math.max(1, palette.length)] ?? dim;
    const barAt = at + i * stagger;
    let bar, labelX, labelY, labelAnchor;
    if (vertical) {
      const cx = -w / 2 + thickness / 2 + i * (thickness + gap);
      const cy = h / 2 - len / 2;
      bar = s.rect(thickness, len, barColor, { name: `bar-${i}`, parent: g.id, r: rounded, x: cx, y: cy });
      bar.animate({ scaleY: [0, 1], offsetY: [len / 2, 0] }, { at: barAt, dur, ease });
      labelX = cx;
      labelY = h / 2 - len - 16;
      labelAnchor = "center";
      if (axisLabels && labelStrs[i] != null) {
        const lbl = s.text(labelStrs[i], { parent: g.id, x: cx, y: h / 2 + 24, mw: 0.9, size: 22, weight: 600, color: dim });
        lbl.enter({ from: { offsetY: 8, opacity: 0 }, at: barAt, dur: dur * 0.6 });
        dataLabels.push(lbl);
      }
    } else {
      const cy = -h / 2 + thickness / 2 + i * (thickness + gap);
      const cx = -w / 2 + len / 2;
      bar = s.rect(len, thickness, barColor, { name: `bar-${i}`, parent: g.id, r: rounded, x: cx, y: cy });
      bar.animate({ scaleX: [0, 1], offsetX: [-len / 2, 0] }, { at: barAt, dur, ease });
      labelX = -w / 2 + len + 16;
      labelY = cy;
      labelAnchor = "left";
      if (axisLabels && labelStrs[i] != null) {
        const lbl = s.text(labelStrs[i], { parent: g.id, x: -w / 2 - 12, y: cy, mw: 0.3, size: 22, weight: 600, color: dim, anchor: "right" });
        lbl.enter({ from: { opacity: 0 }, at: barAt, dur: dur * 0.6 });
        dataLabels.push(lbl);
      }
    }
    bars.push(bar);
    if (labels) {
      const lbl = s.text(fmt(0, format), {
        parent: g.id, x: labelX, y: labelY, mw: 0.9, size: 26, weight: 700,
        color: isHi ? color : "#f4fbf8", anchor: labelAnchor
      });
      lbl.count({ from: 0, to: value, at: barAt, dur: dur * 0.85, ...format, ease: "outExpo" });
      lbl.enter({ from: { opacity: 0 }, at: barAt, dur: 0.15 });
      valueLabels.push(lbl);
    }
  });
  return { group: g, bars, valueLabels, dataLabels };
}

/**
 * `lineChart(s, series, o)` — one path that draws on (`trimEnd`, the same
 * mechanism `el.draw()` wraps), points scaled into a `w`×`h` box, optional
 * dot markers that pop in as the line reaches them, and an end-of-line
 * value that counts from the first point to the last across the same
 * window the line draws in.
 *
 * `series`: `[number, ...]` (evenly spaced x) or `[{x, y}, ...]` (`x` in
 * 0..1 across the box).
 * `o`: `w`, `h`, `dots` (default true), `highlight` (dot index), `color`,
 * `sw` (stroke width), `dur`, `at`, `ease`, `endLabel` (default true),
 * `format`, `x`, `y`, `parent`.
 */
export function lineChart(s, series, o = {}) {
  const {
    w = 600,
    h = 320,
    dots = true,
    highlight,
    color = DEFAULT_COLOR,
    sw = 4,
    dur = 0.8,
    at = 0,
    ease = "outExpo",
    endLabel = true,
    format = {},
    x = 0,
    y = 0,
    parent,
    name = "lineChart"
  } = o;
  const g = s.group({ name, x, y, parent });
  const pts = seriesPoints(series);
  const ys = pts.map((p) => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = maxY - minY || 1;
  const coords = pts.map((p) => [-w / 2 + p.x * w, h / 2 - ((p.y - minY) / span) * h]);
  const linePoints = coords.map(([px, py], i) => [i === 0 ? "M" : "L", px, py]);
  const line = s.path(linePoints, { name: "line", parent: g.id, stroke: color, sw });
  line.draw({ at, dur, ease });
  const dotEls = [];
  if (dots) {
    coords.forEach(([px, py], i) => {
      const isHi = i === highlight;
      const dot = s.ellipse(isHi ? 16 : 10, isHi ? color : "#f4fbf8", { name: `dot-${i}`, parent: g.id, x: px, y: py });
      dot.enter({ from: { scale: 0, opacity: 0 }, at: at + (dur * i) / Math.max(1, coords.length - 1), dur: 0.2, ease: "outExpo" });
      dotEls.push(dot);
    });
  }
  let label;
  if (endLabel) {
    const [lx, ly] = coords[coords.length - 1];
    label = s.text(fmt(pts[0].y, format), { parent: g.id, x: lx, y: ly - 28, size: 26, weight: 700, color, mw: 0.4 });
    label.count({ from: pts[0].y, to: pts[pts.length - 1].y, at, dur, ...format, ease });
    label.enter({ from: { opacity: 0 }, at, dur: 0.2 });
  }
  return { group: g, line, dots: dotEls, label };
}

/**
 * `areaChart(s, series, o)` — `lineChart`'s filled sibling. The same scaled
 * points close into a baseline-filled shape that grows up from the bottom
 * (the `barChart` baseline-grow idiom, applied to the whole fill), with an
 * optional stroked line drawn on top over the same window.
 *
 * `series`/`o` match `lineChart`, plus `fill` (color or gradient stop list;
 * default a soft top-to-bottom wash of `color`) and `line` (draw a stroked
 * line on top, default true).
 */
export function areaChart(s, series, o = {}) {
  const {
    w = 600,
    h = 320,
    color = DEFAULT_COLOR,
    sw = 4,
    dur = 0.6,
    at = 0,
    ease = "outExpo",
    fill,
    line: drawLine = true,
    x = 0,
    y = 0,
    parent,
    name = "areaChart"
  } = o;
  const g = s.group({ name, x, y, parent });
  const pts = seriesPoints(series);
  const ys = pts.map((p) => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = maxY - minY || 1;
  const coords = pts.map((p) => [-w / 2 + p.x * w, h / 2 - ((p.y - minY) / span) * h]);
  const areaPoints = [
    ["M", coords[0][0], h / 2],
    ...coords.map(([px, py]) => ["L", px, py]),
    ["L", coords[coords.length - 1][0], h / 2],
    ["Z"]
  ];
  const fillStyle = fill ?? {
    type: "linear",
    angle: 90,
    stops: [{ offset: 0, color: hexA(color, 0.55) }, { offset: 1, color: hexA(color, 0) }]
  };
  const area = s.path(areaPoints, { name: "area", parent: g.id, fill: fillStyle });
  area.animate({ scaleY: [0, 1], offsetY: [h / 2, 0] }, { at, dur, ease });
  let line;
  if (drawLine) {
    const linePoints = coords.map(([px, py], i) => [i === 0 ? "M" : "L", px, py]);
    line = s.path(linePoints, { name: "line", parent: g.id, stroke: color, sw });
    line.draw({ at, dur, ease });
  }
  return { group: g, area, line };
}

/**
 * `donut(s, data, o)` — a ring, one stroked arc per datum (tessellated as a
 * short M/L polyline, not an SVG `A` command — the renderer's path pipeline
 * draws straight segments but drops a true arc), sweeping in clockwise from
 * 12 o'clock and staggered via `trimEnd`; the arcs' `startDeg`/`endDeg`
 * always sum their sweeps to 360 (minus the `gap` notches) regardless of
 * `data`'s values, since each is `value / total * 360`.
 *
 * `data`: `[number, ...]` or `[{value, label}, ...]`.
 * `o`: `d` (diameter), `thickness` (default `d * 0.22`), `gap` (degrees of
 * notch between segments), `stagger`, `at`, `dur`, `ease`, `highlight`
 * (index drawn in `color`), `color`, `palette` (cycled per segment),
 * `centerLabel` (the total, counts up, default true), `format`, `x`, `y`,
 * `parent`.
 */
export function donut(s, data, o = {}) {
  const {
    d = 420,
    thickness,
    gap = 4,
    stagger = 0.1,
    at = 0,
    dur = 0.6,
    ease = "outExpo",
    highlight,
    color = DEFAULT_COLOR,
    palette = [DEFAULT_COLOR, "#f4a340", "#5aa9e6", "#e6607a", "#8fb3a6"],
    centerLabel = true,
    format = {},
    x = 0,
    y = 0,
    parent,
    name = "donut"
  } = o;
  const g = s.group({ name, x, y, parent });
  const r = d / 2;
  const sw = thickness ?? d * 0.22;
  const vals = values(data);
  const labelStrs = labelsOf(data);
  const total = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const segments = [];
  let cursorDeg = -90;
  vals.forEach((value, i) => {
    const sweepDeg = Math.max(0, (Math.max(0, value) / total) * 360);
    const startDeg = cursorDeg + gap / 2;
    const endDeg = Math.max(startDeg, cursorDeg + sweepDeg - gap / 2);
    cursorDeg += sweepDeg;
    const isHi = i === highlight;
    const segColor = isHi ? color : palette[i % Math.max(1, palette.length)];
    // A tessellated M/L polyline, not a single SVG `A` arc command: the
    // renderer's path pipeline (GPU, not Canvas 2D) draws straight segments
    // but silently drops an arc command, leaving the ring invisible. ~6deg
    // per segment is visually indistinguishable from a true arc at any size
    // this chart renders at, and — being plain M/L — it also supports
    // `el.draw()`'s `trimEnd` sweep, the same mechanism the line chart uses.
    const steps = Math.max(2, Math.ceil((endDeg - startDeg) / 6));
    const arcPoints = [];
    for (let k = 0; k <= steps; k += 1) {
      const deg = startDeg + ((endDeg - startDeg) * k) / steps;
      const a = rad(deg);
      arcPoints.push([k === 0 ? "M" : "L", r * Math.cos(a), r * Math.sin(a)]);
    }
    const arc = s.path(arcPoints, { name: `seg-${i}`, parent: g.id, stroke: segColor, sw });
    arc.draw({ at: at + i * stagger, dur, ease });
    segments.push({ clip: arc, value, startDeg, endDeg, label: labelStrs[i] });
  });
  let label;
  if (centerLabel) {
    const labelDur = Math.max(1, vals.length - 1) * stagger + dur;
    label = s.text(fmt(0, format), { parent: g.id, size: d * 0.16, weight: 700, color: "#f4fbf8", mw: 0.6 });
    label.count({ from: 0, to: total, at, dur: labelDur, ...format, ease: "outExpo" });
    label.enter({ from: { opacity: 0 }, at, dur: 0.2 });
  }
  return { group: g, segments, label };
}

/**
 * `statCounter(s, value, o)` — a single number that counts up: the building
 * block `barChart`'s value labels use, on its own for a callout number
 * that isn't part of a chart. `o`: `from` (default 0), `format`
 * ({decimals, prefix, suffix, padTo, groupSeparator}), `at`, `dur`,
 * `ease`, plus every `s.text` option (`size`, `weight`, `color`, `font`,
 * `x`, `y`, `parent`).
 */
export function statCounter(s, value, o = {}) {
  const { from = 0, format = {}, at = 0, dur = 0.8, ease = "outExpo", ...textOpts } = o;
  const el = s.text(fmt(from, format), { size: 64, weight: 700, color: "#f4fbf8", ...textOpts });
  el.count({ from, to: value, at, dur, ...format, ease });
  el.enter({ from: { opacity: 0 }, at, dur: 0.2 });
  return el;
}
