// M0 mappings use the native report's submitIntervalMs for the frame clock
// called the present interval in PLAN M1a. Neither frame clock times display presentation.
const mappings = [
  ["submitIntervalMs", "renderIntervalMs", "between compositor-submit diagnostics: frames composited"],
  ["rafIntervalMs", "submitIntervalMs", "between requestAnimationFrame callbacks in headed Chromium: page frame clock"],
  ["frameWorkMs", "cpuMs", "latest rAF at or before each compositor-submit to that submit: main-thread frame work"],
  ["frameError", "frameError", "per submitted frame, largest |shown - expected| source frame index over WebCodecs layers, using ffprobe packet times"],
  ["heldFrames", "heldFrames", "total submitted frames with a timed layer older than its target; no percentile samples"]
];

// BenchReport omits these method strings. Keep the definitions next to each
// number, from BenchRun's collection. The frameSwapped method comes from
// the report's method.submitIntervalMs.
const nativeMethods = {
  renderIntervalMs: "between PreviewCompositor render() calls, steady clock",
  heldFrames: "total rendered frames where layers were active but no layer drew, reusing the previous canvas; no percentile samples"
};
const measured = (s) => s && Number.isFinite(s.count) && s.count > 0 && Number.isFinite(s.p50) && Number.isFinite(s.p95);
const lower = (a, b) => a === b ? "equal" : a < b ? "native" : "web";
const validLoad = (l) => Number.isFinite(l?.before) && Number.isFinite(l?.after);

/** Pure pairing of one native window bench with both serein web runs. */
export function pairSereinM0({ nativeReport, nativeMeta, webReport }) {
  const failures = [];
  if (!nativeReport) failures.push("missing native report");
  if (!webReport) failures.push("missing web report");
  if (!Number.isInteger(nativeMeta?.exit)) failures.push("native bench did not run (missing exit code)");
  else if (nativeMeta.exit !== 0) failures.push(`native bench failed: exit ${nativeMeta.exit}`);
  if (!(nativeReport?.frames > 0)) failures.push("native bench measured no frames");
  const nativeLoad = { before: nativeMeta?.loadBefore ?? null, after: nativeMeta?.loadAfter ?? null };
  if (!validLoad(nativeLoad)) failures.push("native run missing load before/after");
  const nativeLoadAllowed = validLoad(nativeLoad) && nativeLoad.before <= 10 && nativeLoad.after <= 10;
  if (nativeLoad.before > 10 || nativeLoad.after > 10) failures.push("native load exceeds 10 before/after run");
  const nativeRan = nativeMeta?.exit === 0 && nativeReport?.frames > 0;
  const results = [];
  for (const decoder of ["element", "webcodecs"]) {
    const matches = (webReport?.results ?? []).filter((r) => r.fixture === "example:serein" && r.decoder === decoder);
    if (matches.length !== 1) {
      failures.push(`${decoder}: ${matches.length ? "duplicate" : "missing"} web serein result`);
    }
    const web = matches.length === 1 ? matches[0].web : null;
    const webLoad = { before: web?.loadAverage?.before ?? null, after: web?.loadAverage?.after ?? null };
    if (!validLoad(webLoad)) failures.push(`${decoder}: web run missing load before/after`);
    if (!(web?.submittedFrames > 0)) failures.push(`${decoder}: web measured no frames`);
    const webLoadAllowed = validLoad(webLoad) && webLoad.before <= 10;
    if (webLoad.before > 10) failures.push(`${decoder}: web load exceeds 10 before run`);
    const matchingDuration = Number.isFinite(nativeMeta?.playSeconds) && nativeMeta.playSeconds > 0 &&
      Number.isFinite(web?.playSeconds) && web.playSeconds > 0 && nativeMeta.playSeconds === web.playSeconds;
    if (!matchingDuration) failures.push(`${decoder}: missing or different native/web playSeconds`);
    const pairs = [];
    const uncompared = [{ counter: "lateFrames", reason: "no native counterpart" }];
    for (const [webKey, nativeKey, webMethod] of mappings) {
      // The element decoder has no frame-presented diagnostics by contract.
      if (decoder === "element" && ["frameError", "heldFrames"].includes(webKey)) {
        uncompared.splice(uncompared.length - 1, 0, { counter: webKey, reason: "element decoder emits no per-frame diagnostic" });
        continue;
      }
      const scalar = webKey === "heldFrames";
      const nativeMethod = nativeReport?.method?.[nativeKey] ?? nativeMethods[nativeKey] ?? "unavailable: native report has no method";
      const side = (report, key, method, loadAverage, scalarSamples) => {
        const s = report?.[key];
        const count = scalar ? scalarSamples : s?.count;
        const hasSamples = scalar
          ? Number.isFinite(s) && s >= 0 && Number.isFinite(count) && count > 0
          : measured(s);
        return {
          counter: key, method, loadAverage: { ...loadAverage },
          count: count ?? 0,
          p50: !scalar && hasSamples ? s.p50 : null,
          p95: !scalar && hasSamples ? s.p95 : null,
          ...(scalar ? { total: hasSamples ? s : null } : {}),
          hasSamples: Boolean(hasSamples)
        };
      };
      const native = side(nativeReport, nativeKey, nativeMethod, nativeLoad, nativeReport?.frames);
      const webSide = side(web, webKey, webMethod, webLoad, web?.frameError?.count);
      const pairFailures = [];
      for (const [label, value] of [["native", native], ["web", webSide]]) {
        if (!value.hasSamples) pairFailures.push(`${decoder}: ${label} ${value.counter} has no samples`);
        if (value.method.startsWith("unavailable:")) pairFailures.push(`${decoder}: ${label} ${value.counter} has no method`);
      }
      failures.push(...pairFailures);
      const comparable = matchingDuration && nativeRan && web?.submittedFrames > 0 && nativeLoadAllowed && webLoadAllowed && pairFailures.length === 0;
      const stats = scalar ? ["total"] : ["p50", "p95"];
      pairs.push({
        native, web: webSide,
        ...(webKey === "rafIntervalMs" ? { note: "Frame clocks: headed Chromium's rAF against Qt's frameSwapped, and neither measures presentation time on the display." } : {}),
        lower: Object.fromEntries(stats.map((stat) => [stat, comparable ? lower(native[stat], webSide[stat]) : null])),
        failures: pairFailures
      });
    }
    results.push({ decoder, pairs, uncompared });
  }
  return { fixture: "example:serein", verdict: failures.length ? "fail" : "pass", failures, results };
}
