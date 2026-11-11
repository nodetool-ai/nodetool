import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { CASE_IDS, WEB_FIXTURE_GAPS, compare, decodePng, failsCheck, loadCapture, measurePixels, metricDifference } from "./compare-visuals.mjs";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=", "base64");
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "visual-compare-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = (surface) => ({ version: 1, surface, environment: { dpr: 1, uiScale: 1, textScale: 1, locale: "en" }, cases: CASE_IDS.flatMap((id) => ["dark", "light"].map((scheme) => ({ id, scheme, state: "default", source: "native/node-editor/README.md", image: "pixel.png", metrics: { width: 1, height: 1, "font.family": "Arial", "font.size": 12, "font.weight": 400, "border.width": 1, "border.radius": 4, "padding.top": 4, "padding.right": 8, "padding.bottom": 4, "padding.left": 8, gap: 4, "stroke.color": "#ffffffff", "stroke.width": 1, color: "#ffffffff" } }))) });
  for (const surface of ["web", "qt"]) {
    await mkdir(join(root, surface));
    await writeFile(join(root, surface, "pixel.png"), png);
    await writeFile(join(root, surface, "manifest.json"), JSON.stringify(manifest(surface)));
  }
  return { root, web: join(root, "web"), qt: join(root, "qt"), out: join(root, "report"), manifest };
}

test("matching explicit observations pass and HTML embeds images", async (t) => {
  const f = await fixture(t);
  const report = await compare(f);
  assert.deepEqual(report.counts, { passed: 454, different: 0, unmeasured: 0, incompatible: 0, missing: 0 });
  const html = await readFile(join(f.out, "index.html"), "utf8");
  assert.match(html, /data:image\/png;base64/);
  assert.match(html, /type="range"/);
});

test("numeric and channel tolerances preserve real deltas", () => {
  assert.deepEqual(metricDifference("width", 12, 12.25), { status: "passed", delta: 0.25 });
  assert.equal(metricDifference("width", 12, 13).status, "different");
  assert.equal(metricDifference("font.weight", 400, 401).status, "different");
  assert.equal(metricDifference("color", "#ffffffff", "#fefefeff").status, "passed");
  assert.equal(metricDifference("color", "#ffffffff", "#ff00ffff").status, "different");
  assert.equal(metricDifference("gap", null, null).status, "unmeasured");
});

test("coverage checks both directions, expected cases, and duplicate identity", async (t) => {
  const f = await fixture(t);
  const m = f.manifest("qt");
  m.cases.shift();
  m.cases.push({ ...m.cases[0] });
  m.cases.push({ ...m.cases[0], id: "qt-only" });
  await writeFile(join(f.qt, "manifest.json"), JSON.stringify(m));
  const report = await compare(f);
  assert.equal(report.counts.missing, 2);
  assert.ok(report.issues.some((issue) => issue.includes("duplicate")));
});

test("invalid environment, metrics, dimensions, images, schemes and states are reported", async (t) => {
  const f = await fixture(t);
  const m = f.manifest("qt");
  m.environment.dpr = 2;
  m.cases[0].metrics.width = 100;
  m.cases[0].metrics.color = "red";
  m.cases[0].metrics.gap = "NaN";
  m.cases[1].image = "absent.png";
  m.cases[2].scheme = "invalid";
  m.cases[3].state = "";
  await writeFile(join(f.qt, "manifest.json"), JSON.stringify(m));
  const capture = await loadCapture(f.qt, "qt");
  for (const pattern of ["environment.dpr", "image width", "invalid color", "invalid numeric", "absent.png", "invalid case"]) {
    assert.ok(capture.issues.some((issue) => issue.includes(pattern)), pattern);
  }
});

test("nonfinite JSON numbers and incompatible states fail check without losing report", async (t) => {
  const f = await fixture(t);
  const m = f.manifest("qt");
  m.cases[0].state = "focused";
  m.cases[0].metrics.gap = "NONFINITE";
  await writeFile(join(f.qt, "manifest.json"), JSON.stringify(m).replace('"NONFINITE"', '1e999'));
  const result = spawnSync(process.execPath, [new URL("compare-visuals.mjs", import.meta.url).pathname, "--web", f.web, "--qt", f.qt, "--out", f.out, "--check"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  const report = JSON.parse(await readFile(join(f.out, "report.json"), "utf8"));
  assert.ok(report.issues.some((issue) => issue.includes("invalid metric gap")));
  assert.ok(report.issues.some((issue) => issue.includes("incompatible states")));
});

test("null metrics stay unmeasured and source text is escaped", async (t) => {
  const f = await fixture(t);
  const m = f.manifest("qt");
  m.cases[0].metrics.gap = null;
  m.cases[0].source = 'native/<script>.qml';
  await writeFile(join(f.qt, "manifest.json"), JSON.stringify(m));
  const result = await compare(f);
  assert.equal(result.counts.unmeasured, 1);
  assert.match(await readFile(join(f.out, "index.html"), "utf8"), /native\/&lt;script&gt;.qml/);
});

test("capture bounds validate PNG separately from honest component metrics and signed text padding", async (t) => {
  const f = await fixture(t);
  const m = f.manifest("web");
  m.cases[0].metrics.height = 18.6875;
  m.cases[0].metrics["padding.bottom"] = -3;
  m.cases[0].metrics["font.stack"] = "Inter, sans-serif";
  m.cases[0].metrics["qt.renderer"] = "diagnostic";
  await writeFile(join(f.web, "manifest.json"), JSON.stringify(m));
  assert.ok((await loadCapture(f.web, "web")).issues.some(issue => issue.includes("image height")));
  m.cases[0].captureBounds = { width: 1, height: 1 };
  await writeFile(join(f.web, "manifest.json"), JSON.stringify(m));
  const report = await compare(f);
  assert.equal(report.counts.incompatible, 0);
  assert.equal(report.counts.unmeasured, 0);
  assert.equal(report.comparisons[0].metrics.find(metric => metric.name === "height").status, "different");
  assert.equal(report.comparisons[0].web.metrics["padding.bottom"], -3);
  assert.ok(!report.comparisons[0].metrics.some(metric => metric.name === "font.stack"));
  m.cases[0].captureBounds.height = 30;
  await writeFile(join(f.web, "manifest.json"), JSON.stringify(m));
  assert.ok((await loadCapture(f.web, "web")).issues.some(issue => issue.includes("image height")));
});

test("connection extent is diagnostic while stroke differences remain style differences", async (t) => {
  const f = await fixture(t);
  const m = f.manifest("qt");
  for (const item of m.cases.filter(item => item.id === "connection")) {
    item.captureBounds = { width: 1, height: 1 };
    item.metrics.width = 200;
    item.metrics["stroke.width"] = 3;
  }
  await writeFile(join(f.qt, "manifest.json"), JSON.stringify(m));
  const report = await compare(f);
  assert.equal(report.counts.incompatible, 0);
  const row = report.comparisons.find(row => row.key === "connection/dark");
  assert.deepEqual(row.metrics.map(metric => metric.name).sort(), ["stroke.color", "stroke.width"]);
  assert.equal(row.metrics.find(metric => metric.name === "stroke.width").status, "different");
});

function rgbPng(width, height, paint) {
  const crc = (buffer) => {
    let value = ~0;
    for (const byte of buffer) { value ^= byte; for (let bit = 0; bit < 8; bit++) { value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); } }
    return ~value >>> 0;
  };
  const chunk = (name, data) => {
    const head = Buffer.alloc(4); head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(name, "latin1"), data]);
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(body));
    return Buffer.concat([head, body, tail]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) { paint(x, y).forEach((value, channel) => { raw[y * (width * 3 + 1) + 1 + x * 3 + channel] = value; }); }
  }
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("pixel probes measure rendered content rather than reported metrics", () => {
  const image = decodePng(rgbPng(20, 12, (x, y) => (x >= 2 && x < 18 && y >= 2 && y < 10) ? ((x === 2 || x === 17 || y === 2 || y === 9) ? [90, 90, 90] : (x === 9 && y === 5 ? [250, 250, 250] : [40, 40, 40])) : [8, 9, 10]));
  const probes = measurePixels(image, "button-default");
  assert.equal(probes["pixel.width"], 16);
  assert.equal(probes["pixel.height"], 8);
  assert.equal(probes["pixel.fill"], "#282828ff");
  assert.equal(probes["pixel.ink"], "#fafafaff");
  assert.equal(probes["pixel.edge"], "#5a5a5aff");
  const port = measurePixels(decodePng(rgbPng(12, 12, (x, y) => Math.hypot(x - 6, y - 6) < 4 ? [255, 168, 8] : [13, 14, 16])), "port-input");
  assert.equal(port["pixel.fill"], "#ffa808ff");
  assert.equal(port["pixel.coreWidth"], 7);
  const wire = measurePixels(decodePng(rgbPng(40, 20, (x, y) => y === 10 ? [255, 168, 8] : [8, 9, 10])), "connection");
  assert.equal(wire["pixel.stroke"], "#ffa808ff");
  assert.equal(wire["pixel.strokeWidth"], 1);
  // A source handle in the crop corner must not become the measured background.
  const cornered = measurePixels(decodePng(rgbPng(40, 20, (x, y) => (x < 3 && y < 3) ? [255, 168, 8] : y === 10 ? [130, 88, 9] : [8, 9, 10])), "connection");
  assert.equal(cornered["pixel.stroke"], "#825809ff");
  assert.equal(cornered["pixel.strokeWidth"], 1);
});

test("declared metrics that match cannot hide different pixels, and evidence is separated", async (t) => {
  const f = await fixture(t);
  const m = f.manifest("qt");
  for (const item of m.cases) { item.evidence = item.id === "node-card" ? "painter-constant" : "live-property"; item.captureBounds = { width: 30, height: 30 }; }
  await writeFile(join(f.qt, "manifest.json"), JSON.stringify(m));
  const web = f.manifest("web");
  for (const item of web.cases) { item.captureBounds = { width: 30, height: 30 }; }
  await writeFile(join(f.web, "manifest.json"), JSON.stringify(web));
  const card = rgbPng(30, 30, (x, y) => x > 5 && x < 25 && y > 5 && y < 25 ? [40, 40, 40] : [0, 0, 0]);
  await writeFile(join(f.web, "pixel.png"), card);
  await writeFile(join(f.qt, "pixel.png"), card);
  const same = await compare(f);
  assert.equal(same.counts.different, 0);
  assert.ok(same.evidence.declared.passed > 0);
  assert.equal(same.evidence.declared.passed + same.evidence.observed.passed, same.counts.passed);
  assert.equal(failsCheck(same), false);
  const cases = m.cases.filter((item) => item.id === "node-card");
  await writeFile(join(f.qt, "drawn.png"), rgbPng(30, 30, (x, y) => x > 5 && x < 25 && y > 5 && y < 25 ? [200, 0, 0] : [0, 0, 0]));
  for (const item of cases) { item.image = "drawn.png"; item.captureBounds = { width: 30, height: 30 }; }
  await writeFile(join(f.qt, "manifest.json"), JSON.stringify(m));
  const drawn = await compare(f);
  assert.equal(drawn.counts.different, 0, "metric comparison alone still agrees");
  assert.ok(drawn.evidence.pixels.different > 0);
  assert.equal(failsCheck(drawn), true);
  assert.match(await readFile(join(f.out, "index.html"), "utf8"), /Measured pixels/);
});

test("a web fixture gap is labeled and stays different", async (t) => {
  const f = await fixture(t);
  const m = f.manifest("qt");
  for (const item of m.cases.filter((item) => item.id === "port-input")) { item.metrics.width = 12; item.captureBounds = { width: 1, height: 1 }; }
  await writeFile(join(f.qt, "manifest.json"), JSON.stringify(m));
  const report = await compare(f);
  const metric = report.comparisons.find((row) => row.key === "port-input/dark").metrics.find((item) => item.name === "width");
  assert.equal(metric.status, "different");
  assert.equal(metric.webFixtureGap, WEB_FIXTURE_GAPS["port-input"]);
  assert.equal(report.evidence.webFixtureGaps, 2);
  assert.equal(failsCheck(report), true);
});
