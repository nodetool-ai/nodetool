import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const stats = (p50, p95) => ({ count: 100, p50, p95, max: p95 });
function reports() {
  const web = {
    submittedFrames: 100, playSeconds: 10, loadAverage: { before: 2, after: 3 },
    submitIntervalMs: stats(16, 21), rafIntervalMs: stats(16, 19),
    frameWorkMs: stats(4, 8), frameError: stats(0, 1), heldFrames: 5
  };
  return {
    nativeReport: {
      frames: 100, renderIntervalMs: stats(15, 22), submitIntervalMs: stats(16, 18),
      cpuMs: stats(2, 6), frameError: stats(0, 2), heldFrames: 3,
      method: { renderIntervalMs: "native render intervals", submitIntervalMs: "QQuickWindow::frameSwapped on the render thread: frame queued, not presented",
        cpuMs: "render() body, steady clock", frameError: "native source-frame error", heldFrames: "native held-frame total" }
    },
    nativeMeta: { exit: 0, playSeconds: 10, loadBefore: 1, loadAfter: 2 },
    webReport: { results: [
      { fixture: "video-4tracks", decoder: "element", web: {} },
      { fixture: "example:serein", decoder: "element", web: { ...web, frameError: null, heldFrames: null } },
      { fixture: "example:serein", decoder: "webcodecs", web }
    ] }
  };
}

test("pairs the native frame clock without a display-presentation counter", async () => {
  const { pairSereinM0 } = await import("./serein-m0.mjs");
  const input = reports();
  assert.equal(Object.hasOwn(input.nativeReport, "presentIntervalMs"), false);
  const result = pairSereinM0(input);
  assert.equal(result.verdict, "pass");
  assert.deepEqual(result.failures, []);
  for (const { pairs } of result.results) {
    const pair = pairs.find((p) => p.web.counter === "rafIntervalMs");
    assert.equal(pair.native.counter, "submitIntervalMs");
    assert.equal(pair.native.method, input.nativeReport.method.submitIntervalMs);
    assert.deepEqual(pair.lower, { p50: "equal", p95: "native" });
    assert.deepEqual(pair.failures, []);
    assert.match(pair.note, /headed Chromium.*rAF.*Qt.*frameSwapped/);
    assert.match(pair.note, /neither.*presentation time on the display/);
  }
});

test("pairs only M0 mapped counters for serein, for both web decoders, with methods and loads", async () => {
  const { pairSereinM0 } = await import("./serein-m0.mjs");
  const input = reports();
  const original = structuredClone(input);
  const result = pairSereinM0(input);
  assert.equal(result.verdict, "pass");
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.results.map((r) => r.decoder), ["element", "webcodecs"]);
  const element = result.results[0];
  assert.deepEqual(element.pairs.map((p) => [p.web.counter, p.native.counter]), [
    ["submitIntervalMs", "renderIntervalMs"], ["rafIntervalMs", "submitIntervalMs"], ["frameWorkMs", "cpuMs"]
  ]);
  const submit = element.pairs[0];
  assert.deepEqual(submit.lower, { p50: "native", p95: "web" });
  assert.equal(submit.native.p50, 15);
  assert.equal(submit.web.p95, 21);
  assert.equal(submit.native.method, "native render intervals");
  assert.match(submit.web.method, /compositor-submit/);
  assert.deepEqual(submit.native.loadAverage, { before: 1, after: 2 });
  assert.deepEqual(submit.web.loadAverage, { before: 2, after: 3 });
  assert.deepEqual(element.uncompared.map((p) => p.counter), ["frameError", "heldFrames", "lateFrames"]);
  assert.match(element.uncompared[0].reason, /element.*diagnostic/);
  const correctness = result.results[1].pairs;
  assert.deepEqual(correctness.map((p) => p.web.counter), ["submitIntervalMs", "rafIntervalMs", "frameWorkMs", "frameError", "heldFrames"]);
  assert.deepEqual(correctness[3].lower, { p50: "equal", p95: "web" });
  assert.equal(correctness[4].native.total, 3);
  assert.equal(correctness[4].web.total, 5);
  assert.equal(correctness[4].native.p50, null);
  assert.equal(correctness[4].web.p95, null);
  assert.equal(correctness[4].lower.total, "native");
  for (const r of result.results) {
    for (const p of r.pairs) {
      assert.ok(p.native.method.length > 0);
      assert.ok(p.web.method.length > 0);
    }
  }
  assert.deepEqual(input, original, "pairing must be pure");
});

for (const [name, corrupt, expected] of [
  ["missing native counter", (r) => { delete r.nativeReport.submitIntervalMs; }, /native submitIntervalMs.*no samples/],
  ["missing web counter", (r) => { delete r.webReport.results[2].web.frameWorkMs; }, /web frameWorkMs.*no samples/],
  ["empty native samples", (r) => { r.nativeReport.cpuMs.count = 0; }, /native cpuMs.*no samples/],
  ["empty web samples", (r) => { r.webReport.results[2].web.frameError.count = 0; }, /web frameError.*no samples/],
  ["missing web serein", (r) => { r.webReport.results = []; }, /missing web serein result/],
  ["missing decoder", (r) => { r.webReport.results.pop(); }, /webcodecs.*missing web serein result/],
  ["missing native report", (r) => { r.nativeReport = null; }, /missing native report/],
  ["missing web report", (r) => { r.webReport = null; }, /missing web report/],
  ["native did not run", (r) => { r.nativeMeta = null; }, /native bench did not run/],
  ["native nonzero exit", (r) => { r.nativeMeta.exit = 7; }, /native bench.*exit 7/],
  ["native no frames", (r) => { r.nativeReport.frames = 0; }, /native bench.*no frames/],
  ["web no frames", (r) => { r.webReport.results[2].web.submittedFrames = 0; }, /web.*no frames/],
  ["held frames without samples", (r) => { r.webReport.results[2].web.frameError.count = 0; }, /web heldFrames.*no samples/],
  ["missing frame-clock method", (r) => { delete r.nativeReport.method.submitIntervalMs; }, /native submitIntervalMs.*method/],
  ["missing method", (r) => { delete r.nativeReport.method.cpuMs; }, /native cpuMs.*method/],
  ["missing load", (r) => { delete r.nativeMeta.loadBefore; }, /native.*load/],
  ["null native load before", (r) => { r.nativeMeta.loadBefore = null; }, /native.*load/],
  ["null native load after", (r) => { r.nativeMeta.loadAfter = null; }, /native.*load/]
]) {
  test(`fails closed: ${name}`, async () => {
    const { pairSereinM0 } = await import("./serein-m0.mjs");
    const input = reports();
    corrupt(input);
    const result = pairSereinM0(input);
    assert.equal(result.verdict, "fail");
    assert.ok(result.failures.some((f) => expected.test(f)), result.failures.join("\n"));
    if (name === "missing native counter") {
      const pair = result.results[0].pairs.find((p) => p.native.counter === "submitIntervalMs");
      assert.deepEqual(pair.lower, { p50: null, p95: null });
      assert.equal(pair.native.p50, null);
    }
    if (name === "native nonzero exit" || name.startsWith("null native load")) {
      assert.ok(result.results.every((r) => r.pairs.every((p) => Object.values(p.lower).every((v) => v === null))));
    }
  });
}

for (const [name, corrupt, affected] of [
  ["missing native duration", r => { delete r.nativeMeta.playSeconds; }, ["element", "webcodecs"]],
  ["missing web duration", r => { delete r.webReport.results[2].web.playSeconds; }, ["webcodecs"]],
  ["different duration", r => { r.webReport.results[2].web.playSeconds = 15; }, ["webcodecs"]]
]) {
  test(`rejects playback intervals: ${name}`, async () => {
    const { pairSereinM0 } = await import("./serein-m0.mjs");
    const input = reports(); corrupt(input);
    const result = pairSereinM0(input);
    assert.equal(result.verdict, "fail");
    assert.ok(result.failures.some(f => /playSeconds/.test(f)), result.failures.join("\n"));
    for (const { decoder, pairs } of result.results) {
      assert.ok(pairs.every(p => Object.values(p.lower).every(v => affected.includes(decoder) ? v === null : v !== null)));
    }
  });
}

for (const [name, corrupt, affected] of [
  ["native before", r => { r.nativeMeta.loadBefore = 10.1; }, ["element", "webcodecs"]],
  ["native after", r => { r.nativeMeta.loadAfter = 11; }, ["element", "webcodecs"]],
  ["web before", r => { r.webReport.results[2].web.loadAverage = { before: 12, after: 3 }; }, ["webcodecs"]]
]) {
  test(`rejects excessive load: ${name}`, async () => {
    const { pairSereinM0 } = await import("./serein-m0.mjs");
    const input = reports(); corrupt(input);
    const result = pairSereinM0(input);
    assert.equal(result.verdict, "fail");
    assert.ok(result.failures.some(f => /load.*10/.test(f)), result.failures.join("\n"));
    for (const { decoder, pairs } of result.results) {
      assert.ok(pairs.every(p => Object.values(p.lower).every(v => affected.includes(decoder) ? v === null : v !== null)));
    }
  });
}
test("accepts load at the limit and web load rising after the run", async () => {
  const { pairSereinM0 } = await import("./serein-m0.mjs");
  const input = reports(); input.nativeMeta.loadBefore = 10; input.nativeMeta.loadAfter = 10;
  for (const r of input.webReport.results.slice(1)) r.web.loadAverage = { before: 10, after: 11 };
  assert.equal(pairSereinM0(input).verdict, "pass");
});

test("native heldFrames counts rendered frames that reused the canvas, independently of media timing", async () => {
  const { pairSereinM0 } = await import("./serein-m0.mjs");
  const input = reports();
  input.nativeReport.frameError = null;
  input.nativeReport.frames = 20;
  delete input.nativeReport.method.heldFrames;
  const pair = pairSereinM0(input).results[1].pairs.find((p) => p.native.counter === "heldFrames");
  assert.equal(pair.native.count, 20);
  assert.equal(pair.native.total, 3);
  assert.equal(pair.native.hasSamples, true);
  assert.match(pair.native.method, /no layer drew.*previous canvas/);
});

test("example helper writes the full serein document, including all raw clip fields", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "serein-example-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "serein.json");
  const run = spawnSync(process.execPath, [new URL("./example-sequence.mjs", import.meta.url).pathname, "serein", file], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const document = JSON.parse(fs.readFileSync(file, "utf8"));
  const bundle = JSON.parse(fs.readFileSync(new URL("../../../../packages/base-nodes/nodetool/examples/timelines/serein.timeline.json", import.meta.url), "utf8"));
  assert.equal(document.id, "example-serein");
  assert.equal(document.projectId, "examples");
  assert.equal(document.createdAt, "1970-01-01T00:00:00.000Z");
  assert.equal(document.updatedAt, document.createdAt);
  for (const key of ["name", "fps", "width", "height", "durationMs"]) assert.equal(document[key], bundle[key]);
  for (const [key, value] of Object.entries(bundle.document)) assert.deepEqual(document[key], value, key);
  assert.ok(document.clips.length > 0);
});

test("report command reads window-check artifacts and fails closed when the exit file is absent or empty", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "serein-report-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { nativeReport, nativeMeta, webReport } = reports();
  for (const [file, value] of [
    ["m0-serein-native.json", nativeReport], ["m0-serein-native.meta.json", nativeMeta], ["m0-web-headed.json", webReport]
  ]) fs.writeFileSync(path.join(dir, file), JSON.stringify(value));
  for (const exitText of [null, "", "0\n", "9\n"]) {
    if (exitText !== null) fs.writeFileSync(path.join(dir, "m0-serein-native.exit"), exitText);
    const run = spawnSync(process.execPath, [new URL("./serein-m0-report.mjs", import.meta.url).pathname, dir], { encoding: "utf8" });
    const report = JSON.parse(run.stdout);
    assert.equal(run.status, exitText === "0\n" ? 0 : 1, run.stderr);
    assert.equal(report.verdict, exitText === "0\n" ? "pass" : "fail");
    if (exitText !== "0\n") assert.ok(report.failures.some((f) => /native bench/.test(f)));
    else assert.deepEqual(report.results[0].pairs[0].native.loadAverage, { before: 1, after: 2 });
  }
});
