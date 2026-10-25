#!/usr/bin/env node
// Edit-operation conformance (PLAN.md M4 exit 1). Four checks against the
// TypeScript sources:
//
// 1. The package's own tests for trimClip, splitClip, rippleEdit,
//    dropResolve and snapping run unchanged, with the operations they import
//    answered by the native port (build-m2/timeline-ops).
// 2. conformance/differential.test.ts: the same random clip arrays and edits
//    through packages/timeline and the native operations.
// 3. conformance/store-differential.test.ts: the web store's clip actions
//    (TimelineStore.ts, run in jsdom) against the native EditActions.
// 4. conformance/keymap-differential.test.ts: every preset's key resolution.
//
// The package tests the native code does not pass are skipped by name and
// replaced (SKIPPED, conformance/known-differences.test.ts). The run exits 1
// when vitest fails, a requested suite is missing, fails to load or passes
// nothing, a skipped test no longer exists, or the native tool answered no
// call.
//
//   node native/timeline/scripts/op-conformance.mjs [--bin path] [--cases N] [--json]
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");
// Each .mjs exports {config, tests, env?: ({bin}) => env}. Configs stay in
// conformance/, and every requested test must pass at least one comparison.
export async function loadSuites(directory, context) {
  const runs = [];
  const problems = [];
  if (!existsSync(directory)) return { runs, problems };
  for (const name of readdirSync(directory).filter(n => n.endsWith(".mjs")).sort()) {
    try {
      const { default: suite } = await import(pathToFileURL(path.join(directory, name)).href);
      if (!suite || !["vitest.config.mts", "vitest.store.config.mts"].includes(suite.config) ||
          !Array.isArray(suite.tests) || suite.tests.length === 0 ||
          suite.tests.some(t => typeof t !== "string" || !t)) {
        throw new Error("expected an existing config and a nonempty tests array");
      }
      runs.push({ ...suite, env: suite.env ? suite.env(context) : {} });
    } catch (error) {
      problems.push(`${name}: suite failed to load: ${error.message}`);
    }
  }
  return { runs, problems };
}

export function checkSuiteReport(report, skipped = {}) {
  const files = [];
  const problems = [];
  const skippedSeen = new Set();
  let passed = 0;
  if (report.exitCode !== 0) problems.push(`vitest exited ${report.exitCode}`);
  // Every requested suite ran, with no load or collection error, and
  // compared something.
  for (const requested of report.tests) {
    const abs = path.isAbsolute(requested) ? requested : path.join(repo, "packages/timeline", requested);
    const file = report.testResults.find((f) => path.resolve(f.name) === path.resolve(abs));
    const rel = path.relative(repo, abs);
    if (!file) {
      problems.push(`${rel}: suite missing from the report`);
      continue;
    }
    let filePassed = 0;
    let fileFailed = 0;
    for (const t of file.assertionResults) {
      const name = [...t.ancestorTitles, t.title].join(" ");
      if (t.status === "passed") filePassed += 1;
      else if (t.status === "failed") {
        fileFailed += 1;
        problems.push(`${rel} > ${name}: ${(t.failureMessages ?? [])[0]?.split("\n")[0]}`);
      } else if (skipped[name]) skippedSeen.add(name);
    }
    if (file.status === "failed" && fileFailed === 0) problems.push(`${rel}: suite error: ${(file.message ?? "").split("\n")[0]}`);
    if (filePassed === 0) problems.push(`${rel}: no passing comparison`);
    passed += filePassed;
    files.push({ file: rel, passed: filePassed, failed: fileFailed });
  }
  return { files, problems, skippedSeen, passed };
}

async function main() {
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const bin = path.resolve(opt("--bin", path.join(here, "..", "build-m2", "timeline-ops")));
if (!existsSync(bin)) {
  console.error(`no timeline-ops binary at ${bin}`);
  process.exit(2);
}

const PACKAGE_TESTS = [
  "tests/trimClip.test.ts",
  "tests/splitClip.test.ts",
  "tests/rippleEdit.test.ts",
  "tests/dropResolve.test.ts",
  "tests/snap.test.ts",
  "tests/resolveSnap.test.ts",
  "tests/buildSnapPoints.test.ts",
  "tests/animation.split.test.ts",
  "tests/keyframes.test.ts",
  "tests/animation.sourceCurves.test.ts",
  "tests/timeRemap.test.ts",
  "tests/crop.test.ts",
  "tests/takes.test.ts",
  "tests/generatedMatte.test.ts",
  "tests/rateStretch.test.ts",
  "tests/slideEdit.test.ts"
];
const DIFFERENTIAL = path.join(here, "conformance", "differential.test.ts");
const WEB_TESTS = [
  path.join(here, "conformance", "store-differential.test.ts"),
  path.join(here, "conformance", "keymap-differential.test.ts")
];

// Package tests the native code is known not to pass, skipped by name and
// replaced by conformance/known-differences.test.ts: the reason, and the
// exact refusal a replacement asserts. Each must exist in the package and
// show as skipped, so a renamed or deleted test is noticed.
const SKIPPED = Object.fromEntries(
  [
    [["splitClip", "preserves clip metadata and source references across both halves"],
      "identity: `toBe` on nested objects; run with deep equality"],
    [["rateStretchClips", "leaves a time-remapped clip alone"], "identity: `toBe` on the unchanged clip; run with deep equality"],
    [["slideClips", "leaves a group clip alone"], "identity: `toBe` on the unchanged array; run with deep equality"],
    [["keyframes across split and trim", "gives each half of a split the part of the curve it covers"],
      "refused: keyframe curves on a split"],
    [["keyframes across split and trim", "stretches keyframes over an extended clip in the render and the inspector"],
      "refused: keyframe curves on a trim"],
    [["trimClip — source curves", "re-slices on a head trim and keeps the retained motion"], "refused: source-anchored curves"],
    [["trimClip — source curves", "re-slices on a tail trim and keeps the retained motion"], "refused: source-anchored curves"],
    [["splitClip — source curves", "gives each half the part of the curve it shows"], "refused: source-anchored curves"],
    [["splitClip — source curves", "round-trips through a merge of the two halves"], "refused: source-anchored curves"],
    [["resolveAnimatedLayerProps — source time base", "keeps the same opacity at the same timeline time after a head trim"],
      "refused: source-anchored curves"]
  ].map(([parts, reason]) => [parts.join(" "), { parts, reason }])
);
const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// vitest matches the pattern against "<file> > <describe> > <test>".
const SKIP_PATTERN = `^(?!.*(?:${Object.values(SKIPPED)
  .map((e) => escape(e.parts.join(" > ")))
  .join("|")})$)`;
const KNOWN = path.join(here, "conformance", "known-differences.test.ts");

const work = mkdtempSync(path.join(tmpdir(), "op-conformance-"));
const countFile = path.join(work, "calls.txt");
const runs = [
  { config: "vitest.config.mts", tests: [...PACKAGE_TESTS, DIFFERENTIAL, KNOWN], skip: SKIP_PATTERN },
  { config: "vitest.store.config.mts", tests: WEB_TESTS }
];
const extensions = await loadSuites(path.join(here, "conformance", "suites"), { bin });
runs.push(...extensions.runs);
const reports = [];
for (const [i, run] of runs.entries()) {
  const reportFile = path.join(work, `report-${i}.json`);
  const env = {
    ...process.env,
    ...run.env,
    NT_TIMELINE_OPS: bin,
    NT_OPS_COUNT_FILE: countFile,
    NT_DIFF_CASES: opt("--cases", "300"),
    NT_CONFORMANCE_TESTS: run.tests.join(",")
  };
  const args = ["run", "--config", path.join(here, "conformance", run.config), "--reporter=json", `--outputFile=${reportFile}`];
  if (run.skip) args.push("--testNamePattern", run.skip);
  let exitCode = 0;
  try {
    execFileSync(path.join(repo, "node_modules/.bin/vitest"), args, { env, stdio: ["ignore", "ignore", "inherit"] });
  } catch (error) {
    exitCode = error.status ?? 1;
  }
  if (!existsSync(reportFile)) {
    console.error(`FAIL: vitest wrote no report for ${run.config} (exit ${exitCode})`);
    process.exit(1);
  }
  reports.push({ ...JSON.parse(readFileSync(reportFile, "utf8")), exitCode, tests: run.tests });
}
const calls = existsSync(countFile)
  ? readFileSync(countFile, "utf8").split("\n").filter(Boolean).reduce((n, l) => n + Number(l), 0)
  : 0;
rmSync(work, { recursive: true, force: true });

const files = [];
const problems = [...extensions.problems];
const skippedSeen = new Set();
let passed = 0;
for (const report of reports) {
  const checked = checkSuiteReport(report, SKIPPED);
  files.push(...checked.files);
  problems.push(...checked.problems);
  passed += checked.passed;
  for (const name of checked.skippedSeen) skippedSeen.add(name);
}
for (const name of Object.keys(SKIPPED)) {
  if (!skippedSeen.has(name)) problems.push(`skipped test not found in the package: ${name}`);
}
const ok = problems.length === 0 && passed > 0 && calls > 0;
const result = { ok, nativeCalls: calls, passed, skipped: SKIPPED, problems, files };
if (argv.includes("--json")) {
  console.log(JSON.stringify(result));
} else {
  for (const f of files) console.log(`${f.failed ? "FAIL" : "ok  "} ${f.file}: ${f.passed} passed, ${f.failed} failed`);
  for (const name of Object.keys(SKIPPED)) console.log(`skipped: ${name} (${SKIPPED[name].reason})`);
  for (const p of problems) console.log(`PROBLEM: ${p}`);
  console.log(`${ok ? "PASS" : "FAIL"}: ${passed} passed, ${Object.keys(SKIPPED).length} skipped and replaced, ${problems.length} problems, ${calls} native calls`);
}
process.exit(ok ? 0 : 1);

}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
