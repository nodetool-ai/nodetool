#!/usr/bin/env node
/**
 * Decide which ctest tests a native CI job runs on a pull request, from the
 * selection rules of `npm run test:affected:native` applied to the job's own
 * finished build.
 *
 *   node scripts/native-ci-test-selection.mjs --project timeline \
 *     --build native/timeline/build-ci --base <sha> [--force <prefix>]... [--label render]
 *
 * The changed files are `git diff --name-only <base> HEAD`, so files the job
 * generated in the working tree never count. Every test runs when there is no
 * `--base` (scheduled and manual runs), when a changed file starts with a
 * `--force` prefix (the workflow, its actions, the CI image, these scripts, or
 * a reference package the oracles compare against), when the selection itself
 * chooses every test, or when computing it fails.
 *
 * Writes to `$GITHUB_OUTPUT` (stdout without it):
 *   run     true when at least one test runs
 *   filter  a ctest `-R` regular expression, empty for every test
 *   <label> true when a selected test has that label (one line per `--label`)
 *   others  true when a selected test has none of the `--label` labels
 * and a table of the selection to `$GITHUB_STEP_SUMMARY`.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ctestRegex, loadModel, readCache, selectTests } from "./test-affected-native.mjs";

/**
 * The CI decision. `selection` is `selectTests` output, or null when it could
 * not be computed. `tests` lists every test with its labels.
 */
export function decide({ files, force = [], selection, tests, labels = [], error = null }) {
  const labelled = (names) => {
    const chosen = tests.filter((t) => names.has(t.name));
    const out = {};
    for (const label of labels) out[label] = chosen.some((t) => t.labels.includes(label));
    out.others = chosen.some((t) => !t.labels.some((l) => labels.includes(l)));
    return out;
  };
  // Every test runs even when the listing came back empty, so a wrong build
  // directory fails in ctest instead of skipping the tests.
  const every = (reason) => ({
    run: true,
    filter: "",
    reason,
    selected: tests.map((t) => t.name),
    ...labelled(new Set(tests.map((t) => t.name)))
  });
  if (files === null) return every("no base commit: every test runs");
  const forced = files.find((f) => force.some((prefix) => f === prefix || f.startsWith(prefix)));
  if (forced) return every(`${forced} changed: every test runs`);
  if (error) return every(`selection failed (${error}): every test runs`);
  if (selection.all) return every(`${selection.reason}: every test runs`);
  const names = new Set(selection.selected.map((s) => s.test));
  if (names.size === 0) {
    return { run: false, filter: "", reason: "no test depends on the changed files", selected: [], ...labelled(names) };
  }
  return {
    run: true,
    filter: ctestRegex([...names].sort()),
    reason: `${names.size} of ${tests.length} tests depend on the changed files`,
    selected: [...names].sort(),
    ...labelled(names)
  };
}

function parseArgs(argv) {
  const opts = { project: null, build: null, base: null, force: [], labels: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === "--project") opts.project = value();
    else if (arg === "--build") opts.build = resolve(value());
    else if (arg === "--base") opts.base = value() || null;
    else if (arg === "--force") opts.force.push(value());
    else if (arg === "--label") opts.labels.push(value());
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (!opts.project || !opts.build) throw new Error("--project and --build are required");
  return opts;
}

function changedFiles(base) {
  if (!base) return null;
  const result = spawnSync("git", ["diff", "--name-only", base, "HEAD"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git diff ${base} HEAD failed: ${result.stderr.trim()}`);
  return result.stdout.split("\n").filter(Boolean).sort();
}

function listTests(buildDir) {
  const result = spawnSync("ctest", ["--test-dir", buildDir, "--show-only=json-v1"], {
    encoding: "utf8",
    maxBuffer: 1 << 28
  });
  if (result.status !== 0) throw new Error(`ctest --show-only failed in ${buildDir}: ${result.stderr}`);
  return (JSON.parse(result.stdout).tests ?? []).map((t) => ({
    name: t.name,
    labels: (t.properties ?? []).find((p) => p.name === "LABELS")?.value ?? []
  }));
}

function main(argv) {
  const opts = parseArgs(argv);
  const tests = listTests(opts.build);
  const files = changedFiles(opts.base);
  let selection = null;
  let error = null;
  if (files !== null) {
    try {
      const model = loadModel(opts.project, opts.build, readCache(opts.build), (m) => console.error(m));
      if (!model) throw new Error(`no CMake File API reply in ${opts.build}`);
      selection = selectTests(model, files);
    } catch (e) {
      error = e.message;
      console.log(`::warning::native test selection failed, running every test: ${e.message}`);
    }
  }
  const decision = decide({ files, force: opts.force, selection, tests, labels: opts.labels, error });

  console.log(`Native test selection for native/${opts.project}: ${decision.reason}`);
  if (files !== null) console.log(`Changed files (${files.length}) vs ${opts.base}`);
  if (selection && !selection.all) {
    for (const s of selection.selected) console.log(`  ${s.test}  ${s.trigger} (${s.why})`);
    for (const n of selection.notes) console.log(`  not tested: ${n.file} (${n.note})`);
  }

  const outputs = [`run=${decision.run}`, `filter=${decision.filter}`];
  for (const label of opts.labels) outputs.push(`${label}=${decision[label]}`);
  outputs.push(`others=${decision.others}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${outputs.join("\n")}\n`);
  else console.log(outputs.join("\n"));

  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows =
      selection && !selection.all && selection.selected.length
        ? ["", "| Test | Trigger |", "|---|---|", ...selection.selected.map((s) => `| ${s.test} | ${s.trigger} (${s.why}) |`)]
        : [];
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [`### Native tests: native/${opts.project}`, "", decision.reason, ...rows, ""].join("\n") + "\n"
    );
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`native-ci-test-selection: ${error.message}`);
    process.exitCode = 1;
  }
}
