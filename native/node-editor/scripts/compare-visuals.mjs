import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, relative, isAbsolute, extname } from "node:path";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const CASE_IDS = "button-default button-primary button-disabled text-field text-field-focus text-field-disabled text-label text-caption surface-panel node-card node-selected port-input port-output connection catalog-row inspector-field".split(" ");
export const TOLERANCES = { logicalPixels: 0.5, colorChannel: 1, fontWeight: 0 };
// Metric sizes and colors are observations reported by each exporter. Pixel
// probes are measured here from both PNG files with one algorithm.
export const PIXEL_TOLERANCES = { size: 1, color: 4, ink: 24, strokeWidth: 1 };
// The web fixture does not load these production styles. A difference stays
// different, and the report says which side is the fixture.
export const WEB_FIXTURE_GAPS = {
  "port-input": "Fixture lacks handle_edge_tooltip.css, so its handle is React Flow's default.",
  "port-output": "Fixture lacks handle_edge_tooltip.css, so its handle is React Flow's default.",
  connection: "Fixture lacks useProcessedEdges and handle_edge_tooltip.css, so its wire is React Flow's default.",
  "catalog-row": "Fixture renders the older NodeItem. Production uses NodeLibraryRow."
};
const CANVAS_CASES = new Set(["node-card", "node-selected"]);
const PORT_CASES = new Set(["port-input", "port-output"]);
const requiredMetrics = "width height font.family font.size font.weight border.width border.radius padding.top padding.right padding.bottom padding.left gap".split(" ");
const diagnosticMetric = (name, id) => name === "font.stack" || name.startsWith("qt.") || (id === "connection" && !name.startsWith("stroke."));
const keyOf = (item) => `${item.id}/${item.scheme}`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const groupOf = (key) => /color|background|fill|stroke/.test(key) ? "colors" : key.startsWith("border.") ? "borders" : key.startsWith("font.") ? "fonts" : "spacing";

export function metricDifference(key, web, qt) {
  if (web == null || qt == null) { return { status: "unmeasured", delta: null }; }
  if (typeof web !== typeof qt) { return { status: "incompatible", delta: null }; }
  if (typeof web === "number") {
    const delta = qt - web;
    return { status: Math.abs(delta) <= (key === "font.weight" ? 0 : TOLERANCES.logicalPixels) ? "passed" : "different", delta };
  }
  if (/^#[\da-f]{8}$/i.test(web) && /^#[\da-f]{8}$/i.test(qt)) {
    const delta = [1, 3, 5, 7].map((offset) => parseInt(qt.slice(offset, offset + 2), 16) - parseInt(web.slice(offset, offset + 2), 16));
    return { status: delta.every((value) => Math.abs(value) <= TOLERANCES.colorChannel) ? "passed" : "different", delta };
  }
  return { status: web === qt ? "passed" : "different", delta: null };
}

export function decodePng(bytes) {
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), depth = bytes[24], type = bytes[25], interlace = bytes[28];
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (depth !== 8 || !channels || interlace !== 0) { throw new Error(`unsupported PNG format depth ${depth} type ${type} interlace ${interlace}`); }
  const chunks = [];
  let palette = null;
  for (let at = 8; at < bytes.length;) {
    const size = bytes.readUInt32BE(at), name = bytes.toString("latin1", at + 4, at + 8);
    if (name === "IDAT") { chunks.push(bytes.subarray(at + 8, at + 8 + size)); }
    if (name === "PLTE") { palette = bytes.subarray(at + 8, at + 8 + size); }
    at += size + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const rows = [];
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1), filter = raw[start], row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const value = raw[start + 1 + x], a = x >= channels ? row[x - channels] : 0, b = previous[x], c = x >= channels ? previous[x - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      row[x] = (value + [0, a, b, (a + b) >> 1, paeth][filter]) & 255;
    }
    rows.push(row);
    previous = row;
  }
  const pixel = (x, y) => {
    const row = rows[y], at = x * channels;
    if (type === 2 || type === 6) { return [row[at], row[at + 1], row[at + 2]]; }
    if (type === 3) { return [palette[row[at] * 3], palette[row[at] * 3 + 1], palette[row[at] * 3 + 2]]; }
    return [row[at], row[at], row[at]];
  };
  return { width, height, pixel };
}

const hex = (rgb) => `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}ff`;
const distance = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const median = (values) => [...values].sort((a, b) => a - b)[values.length >> 1];

function mostCommon(image, left, top, right, bottom, ignore) {
  const counts = new Map();
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const rgb = image.pixel(x, y), key = rgb.join();
      if (!ignore || distance(rgb, ignore) > 2) { counts.set(key, (counts.get(key) ?? 0) + 1); }
    }
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0].split(",").map(Number) : null;
}

export function measurePixels(image, id) {
  // A wire crop starts on its source handle, so its corner is not the canvas.
  const background = id === "connection" ? mostCommon(image, 0, 0, image.width - 1, image.height - 1) : image.pixel(0, 0);
  const differs = (x, y) => distance(image.pixel(x, y), background) > 3;
  const result = {};
  if (id === "connection") {
    const scans = [];
    let stroke = background, peak = 0;
    for (let x = image.width >> 2; x <= (image.width * 3) >> 2; x++) {
      let run = 0;
      for (let y = 0; y < image.height; y++) {
        const rgb = image.pixel(x, y), gap = distance(rgb, background);
        if (gap > 20) { run++; }
        if (gap > peak) { peak = gap; stroke = rgb; }
      }
      if (run) { scans.push(run); }
    }
    return { "pixel.stroke": hex(stroke), "pixel.strokeWidth": scans.length ? median(scans) : null };
  }
  if (PORT_CASES.has(id)) {
    const cx = image.width >> 1, cy = image.height >> 1, core = image.pixel(cx, cy);
    let left = cx, right = cx;
    while (left > 0 && distance(image.pixel(left - 1, cy), core) <= 48) { left--; }
    while (right < image.width - 1 && distance(image.pixel(right + 1, cy), core) <= 48) { right++; }
    return { "pixel.fill": hex(core), "pixel.coreWidth": right - left + 1 };
  }
  let left = image.width, right = -1, top = image.height, bottom = -1;
  if (CANVAS_CASES.has(id)) {
    // A card crop can hold grid marks and handles, so use the median scan line.
    const span = (lines, length, probe) => {
      const lows = [], highs = [];
      for (const line of lines) {
        let low = -1, high = -1;
        for (let at = 0; at < length; at++) { if (probe(at, line)) { if (low < 0) { low = at; } high = at; } }
        if (low >= 0) { lows.push(low); highs.push(high); }
      }
      return lows.length ? [median(lows), median(highs)] : [length, -1];
    };
    [left, right] = span([image.height >> 2, image.height >> 1, (image.height * 3) >> 2], image.width, (x, y) => differs(x, y));
    [top, bottom] = span([image.width >> 2, image.width >> 1, (image.width * 3) >> 2], image.height, (y, x) => differs(x, y));
  } else {
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        if (differs(x, y)) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
      }
    }
  }
  if (right < left || bottom < top) { return { "pixel.width": 0, "pixel.height": 0, "pixel.fill": null, "pixel.ink": null, "pixel.edge": null }; }
  result["pixel.width"] = right - left + 1;
  result["pixel.height"] = bottom - top + 1;
  const inset = Math.min(2, (right - left) >> 1, (bottom - top) >> 1);
  const fill = mostCommon(image, left + inset, top + inset, right - inset, bottom - inset) ?? background;
  result["pixel.fill"] = hex(fill);
  let ink = fill, peak = -1;
  for (let y = top + inset; y <= bottom - inset; y++) {
    for (let x = left + inset; x <= right - inset; x++) {
      const gap = distance(image.pixel(x, y), fill);
      if (gap > peak) { peak = gap; ink = image.pixel(x, y); }
    }
  }
  result["pixel.ink"] = hex(ink);
  // Bare text has no border, and its first column is only antialiased glyph.
  if (!id.startsWith("text-") || id.startsWith("text-field")) { result["pixel.edge"] = hex(image.pixel(left, (top + bottom) >> 1)); }
  return result;
}

function pixelDifference(name, web, qt) {
  if (web == null || qt == null) { return { status: "unmeasured", delta: null }; }
  if (typeof web === "number") {
    const delta = qt - web;
    return { status: Math.abs(delta) <= (name === "pixel.strokeWidth" ? PIXEL_TOLERANCES.strokeWidth : PIXEL_TOLERANCES.size) ? "passed" : "different", delta };
  }
  const delta = [1, 3, 5].map((offset) => parseInt(qt.slice(offset, offset + 2), 16) - parseInt(web.slice(offset, offset + 2), 16));
  const limit = name === "pixel.ink" ? PIXEL_TOLERANCES.ink : PIXEL_TOLERANCES.color;
  return { status: delta.every((value) => Math.abs(value) <= limit) ? "passed" : "different", delta };
}

export const failsCheck = (report) => Object.entries(report.counts).some(([key, value]) => key !== "passed" && value > 0)
  || report.evidence.pixels.different > 0 || report.evidence.pixels.unmeasured > 0;

export async function loadCapture(directory, surface) {
  const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"));
  const issues = [];
  const cases = new Map();
  if (manifest.version !== 1 || manifest.surface !== surface || !Array.isArray(manifest.cases)) {
    throw new Error(`Invalid ${surface} manifest version, surface, or cases`);
  }
  const env = manifest.environment;
  if (!env || typeof env !== "object" || Array.isArray(env)) { throw new Error(`Missing ${surface} environment`); }
  for (const name of ["dpr", "uiScale", "textScale"]) {
    if (env[name] !== 1) { issues.push(`${surface}: environment.${name} must be 1`); }
  }
  if (typeof env.locale !== "string" || !/^en(?:[-_]|$)/.test(env.locale)) { issues.push(`${surface}: environment.locale must be English`); }
  for (const item of manifest.cases) {
    if (!item || typeof item.id !== "string" || !item.id || !["dark", "light"].includes(item.scheme) || typeof item.state !== "string" || !item.state.trim()) {
      issues.push(`${surface}: invalid case identity, scheme, or state`);
      continue;
    }
    const key = keyOf(item);
    if (cases.has(key)) { issues.push(`${surface}: duplicate ${key}`); continue; }
    const record = { ...item, imageData: null };
    cases.set(key, record);
    if (typeof item.source !== "string" || !item.source || isAbsolute(item.source) || item.source.split(/[\\/]/).includes("..")) { issues.push(`${surface} ${key}: invalid repository source path`); }
    if (!item.metrics || typeof item.metrics !== "object" || Array.isArray(item.metrics)) {
      issues.push(`${surface} ${key}: invalid metrics`);
      record.metrics = {};
    }
    for (const [name, value] of Object.entries(record.metrics)) {
      if (value !== null && !(typeof value === "number" && Number.isFinite(value)) && typeof value !== "string") { issues.push(`${surface} ${key}: invalid metric ${name}`); }
      if (/(?:color|background|fill)$/i.test(name) && value !== null && !/^#[\da-f]{8}$/i.test(value)) { issues.push(`${surface} ${key}: invalid color ${name}`); }
      if ((requiredMetrics.includes(name) && name !== "font.family") && value !== null && (typeof value !== "number" || !Number.isFinite(value) || (value < 0 && !name.startsWith("padding.")))) { issues.push(`${surface} ${key}: invalid numeric metric ${name}`); }
      if (name === "font.family" && value !== null && (typeof value !== "string" || !value)) { issues.push(`${surface} ${key}: invalid font.family`); }
    }
    try {
      if (typeof item.image !== "string" || extname(item.image).toLowerCase() !== ".png" || isAbsolute(item.image)) { throw new Error("expected relative PNG path"); }
      const path = resolve(directory, item.image);
      if (relative(resolve(directory), path).startsWith("..")) { throw new Error("image escapes capture directory"); }
      const bytes = await readFile(path);
      if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") { throw new Error("invalid PNG header"); }
      record.imageWidth = bytes.readUInt32BE(16);
      record.imageHeight = bytes.readUInt32BE(20);
      if (item.captureBounds !== undefined && (!item.captureBounds || !["width", "height"].every(name => Number.isFinite(item.captureBounds[name]) && item.captureBounds[name] > 0))) {
        issues.push(`${surface} ${key}: invalid capture bounds`);
      }
      for (const [name, observed] of [["width", record.imageWidth], ["height", record.imageHeight]]) {
        if (observed <= 0 || (typeof (item.captureBounds ?? record.metrics)[name] === "number" && Math.abs((item.captureBounds ?? record.metrics)[name] - observed) > 1)) { issues.push(`${surface} ${key}: image ${name} differs from logical measurement`); }
      }
      record.imageData = `data:image/png;base64,${bytes.toString("base64")}`;
      try { record.pixels = measurePixels(decodePng(bytes), item.id); } catch (error) { issues.push(`${surface} ${key}: pixels: ${error.message}`); }
    } catch (error) { issues.push(`${surface} ${key}: image: ${error.message}`); }
  }
  return { environment: env, cases, issues };
}

export async function compare({ web, qt, out }) {
  const [left, right] = await Promise.all([loadCapture(web, "web"), loadCapture(qt, "qt")]);
  const issues = [...left.issues, ...right.issues];
  const expected = CASE_IDS.flatMap((id) => ["dark", "light"].map((scheme) => `${id}/${scheme}`));
  const keys = new Set([...expected, ...left.cases.keys(), ...right.cases.keys()]);
  const counts = { passed: 0, different: 0, unmeasured: 0, incompatible: issues.length, missing: 0 };
  // Passing a declared constant does not show that the pixels look like it.
  const evidence = { observed: { passed: 0, different: 0, unmeasured: 0 }, declared: { passed: 0, different: 0, unmeasured: 0 }, pixels: { passed: 0, different: 0, unmeasured: 0 }, webFixtureGaps: 0 };
  const comparisons = [];
  for (const key of keys) {
    const a = left.cases.get(key);
    const b = right.cases.get(key);
    if (!a || !b) { counts.missing++; issues.push(`${key}: missing ${!a && !b ? "web and qt" : !a ? "web" : "qt"} case`); }
    const metrics = [];
    if (a && b) {
      if (a.state !== b.state) { counts.incompatible++; issues.push(`${key}: incompatible states ${a.state} / ${b.state}`); }
      for (const name of new Set([...(a.id === "connection" ? ["stroke.width", "stroke.color"] : requiredMetrics), ...Object.keys(a.metrics), ...Object.keys(b.metrics)])) {
        if (diagnosticMetric(name, a.id)) { continue; }
        const result = metricDifference(name, a.metrics[name], b.metrics[name]);
        counts[result.status]++;
        const source = b.evidence === "painter-constant" ? "declared" : "observed";
        if (result.status in evidence[source]) { evidence[source][result.status]++; }
        const webFixtureGap = result.status === "different" && WEB_FIXTURE_GAPS[a.id] ? WEB_FIXTURE_GAPS[a.id] : undefined;
        if (webFixtureGap) { evidence.webFixtureGaps++; }
        metrics.push({ name, group: groupOf(name), web: a.metrics[name] ?? null, qt: b.metrics[name] ?? null, evidence: b.evidence ?? "unstated", ...(webFixtureGap ? { webFixtureGap } : {}), ...result });
      }
      if (!metrics.some((metric) => metric.group === "colors")) { counts.unmeasured++; metrics.push({ name: "color", group: "colors", web: null, qt: null, status: "unmeasured", delta: null }); }
    }
    const pixels = [];
    for (const name of new Set([...Object.keys(a?.pixels ?? {}), ...Object.keys(b?.pixels ?? {})])) {
      const result = pixelDifference(name, a?.pixels?.[name], b?.pixels?.[name]);
      evidence.pixels[result.status]++;
      pixels.push({ name, web: a?.pixels?.[name] ?? null, qt: b?.pixels?.[name] ?? null, ...result, ...(a && WEB_FIXTURE_GAPS[a.id] ? { webFixtureGap: WEB_FIXTURE_GAPS[a.id] } : {}) });
    }
    comparisons.push({ key, web: a, qt: b, metrics, pixels });
  }
  const result = { version: 1, tolerances: TOLERANCES, pixelTolerances: PIXEL_TOLERANCES, environment: { web: left.environment, qt: right.environment }, counts, evidence, issues, comparisons };
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, "report.json"), JSON.stringify(result, (key, value) => key === "imageData" ? undefined : value, 2));
  await writeFile(resolve(out, "index.html"), renderReport(result));
  return result;
}

function renderReport(result) {
  const source = (item) => item ? `<p>Source path: <code>${escapeHtml(item.source)}</code></p>` : "Missing case";
  const img = (item, label) => item?.imageData ? `<img alt="${label}" src="${item.imageData}" width="${item.imageWidth}" height="${item.imageHeight}">` : `<p>${label}: image unavailable</p>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Node editor comparison</title><style>body{font:16px system-ui;margin:24px;background:#eee;color:#111}section{background:white;padding:20px;margin:20px 0}figure{margin:0;overflow:auto}.pair{display:flex;gap:24px;overflow:auto}.overlay{position:relative;width:max-content;max-width:100%;overflow:auto}.overlay .qt{position:absolute;top:0;left:0;opacity:.5}table{border-collapse:collapse;width:100%}td,th{padding:6px;text-align:left;border:1px solid #ccc}.different,.incompatible{background:#ffd8d8}.unmeasured{background:#fff0bc}pre{white-space:pre-wrap}</style><h1>Node editor comparison</h1><label>Component and theme <select id="case-picker" onchange="document.querySelectorAll('section').forEach((section,index)=>section.hidden=this.value!=='all' &amp;&amp; String(index)!==this.value)"><option value="all">All components</option>${result.comparisons.map((row,index)=>`<option value="${index}">${escapeHtml(row.key)}</option>`).join("")}</select></label><p>Metric counts: ${escapeHtml(JSON.stringify(result.counts))}</p><p>Evidence: ${escapeHtml(JSON.stringify(result.evidence))}. <em>observed</em> metrics are read from live Qt controls. <em>declared</em> metrics are canvas painter constants and do not show what was drawn. <em>pixels</em> are measured from both PNG files with one algorithm.</p><p>Tolerances: ${escapeHtml(JSON.stringify(result.tolerances))}. Pixel tolerances: ${escapeHtml(JSON.stringify(result.pixelTolerances))}.</p><details><summary>Capture environment</summary><pre>${escapeHtml(JSON.stringify(result.environment, null, 2))}</pre></details><ul>${result.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>${result.comparisons.map((row) => `<section><h2>${escapeHtml(row.key)}</h2><div class="pair"><figure><h3>Web</h3>${source(row.web)}${img(row.web, "Web")}</figure><figure><h3>Qt</h3>${source(row.qt)}${img(row.qt, "Qt")}</figure></div><p><label>Qt overlay opacity <input type="range" min="0" max="1" step="0.01" value="0.5" oninput="this.closest('section').querySelector('.qt').style.opacity=this.value"></label></p><div class="overlay">${img(row.web, "Web overlay")}<div class="qt">${img(row.qt, "Qt overlay")}</div></div><details><summary>Capture bounds and diagnostic observations</summary><pre>${escapeHtml(JSON.stringify({web: {captureBounds: row.web?.captureBounds, metrics: row.web?.metrics}, qt: {captureBounds: row.qt?.captureBounds, metrics: row.qt?.metrics}}, null, 2))}</pre></details>${["colors", "borders", "fonts", "spacing"].map((group) => `<h3>${group}</h3><table><tr><th>Metric</th><th>Web</th><th>Qt</th><th>Delta</th><th>Status</th><th>Qt evidence</th></tr>${row.metrics.filter((metric) => metric.group === group).map((metric) => `<tr class="${metric.status}"><td>${escapeHtml(metric.name)}</td><td>${escapeHtml(metric.web)}</td><td>${escapeHtml(metric.qt)}</td><td>${escapeHtml(JSON.stringify(metric.delta))}</td><td>${metric.status}</td><td>${escapeHtml(metric.evidence)}${metric.webFixtureGap ? `. ${escapeHtml(metric.webFixtureGap)}` : ""}</td></tr>`).join("")}</table>`).join("")}<h3>Measured pixels</h3><table><tr><th>Probe</th><th>Web</th><th>Qt</th><th>Delta</th><th>Status</th><th>Note</th></tr>${row.pixels.map((probe) => `<tr class="${probe.status}"><td>${escapeHtml(probe.name)}</td><td>${escapeHtml(probe.web)}</td><td>${escapeHtml(probe.qt)}</td><td>${escapeHtml(JSON.stringify(probe.delta))}</td><td>${probe.status}</td><td>${escapeHtml(probe.webFixtureGap ?? "")}</td></tr>`).join("")}</table></section>`).join("")}</html>`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { web: { type: "string" }, qt: { type: "string" }, out: { type: "string" }, check: { type: "boolean" } } });
    if (!values.web || !values.qt || !values.out) { throw new Error("Usage: compare-visuals.mjs --web DIR --qt DIR --out DIR [--check]"); }
    const report = await compare(values);
    console.log(JSON.stringify({ counts: report.counts, evidence: report.evidence }));
    if (values.check && failsCheck(report)) { process.exitCode = 1; }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
