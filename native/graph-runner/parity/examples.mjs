// Example suite: runs every shipped example workflow
// (packages/base-nodes/nodetool/examples/nodetool-base/*.json) on the native
// runner with fake providers, and keeps each outcome in
// parity/examples-baseline.json. See parity/README.md.
//
//   node parity/examples.mjs [--check | --update] [options]
//
// Options:
//   --runner <path>    native runner binary (default: build/nodetool-graph-runner)
//   --bundle <path>    prebuilt parity guest (guest.js or guest.bin); default: build one
//   --only <text>      only examples whose file name contains <text> (repeatable)
//   --jobs <n>         examples run in parallel (default 2, at most 3)
//   --timeout <ms>     per-example timeout (default 60000)
//   --out <dir>        work and result directory (default: ~/.cache/graph-runner-examples)
//   --check            exit 1 if an outcome differs from the baseline
//   --update           write the outcomes into parity/examples-baseline.json
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { finalStatus, parseStream } from "./compare.mjs";
import {
  CANNOT_COMPLETE,
  prepareForFakeRun,
  unrunnableNodeTypes
} from "../../../packages/base-nodes/tests/support/example-run-preparation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const REPO = resolve(ROOT, "../..");
const BASELINE = join(here, "examples-baseline.json");
const PARITY_BASELINE = join(here, "baseline.json");
const EXAMPLES_DIR = join(REPO, "packages/base-nodes/nodetool/examples/nodetool-base");
const PACKAGE_ASSETS = join(REPO, "packages/base-nodes/nodetool/assets");
const HOME = process.env.HOME;
const LAVAPIPE = "/usr/share/vulkan/icd.d/lvp_icd.json";
const MAX_JOBS = 3;
const OUTCOMES = ["completed", "failed", "timeout"];

// ------------------------------------------------------------------ options

function parseArgs(argv) {
  const opts = {
    runner: join(ROOT, "build", "nodetool-graph-runner"),
    only: [],
    jobs: 2,
    timeout: 60_000,
    out: join(HOME, ".cache", "graph-runner-examples")
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) fail(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === "--runner") opts.runner = resolve(value());
    else if (arg === "--bundle") opts.bundle = resolve(value());
    else if (arg === "--only") opts.only.push(value());
    else if (arg === "--jobs") opts.jobs = Number(value());
    else if (arg === "--timeout") opts.timeout = Number(value());
    else if (arg === "--out") opts.out = resolve(value());
    else if (arg === "--check") opts.check = true;
    else if (arg === "--update") opts.update = true;
    else fail(`unknown argument ${arg}`);
  }
  if (opts.check && opts.update) fail("--check and --update are exclusive");
  if (!Number.isInteger(opts.jobs) || opts.jobs < 1 || opts.jobs > MAX_JOBS) fail(`--jobs must be 1 to ${MAX_JOBS}`);
  if (!(opts.timeout > 0)) fail("--timeout must be a positive number of milliseconds");
  if (!existsSync(opts.runner)) fail(`no runner at ${opts.runner}; build it (README.md#build) or pass --runner`);
  return opts;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(2);
}

// ------------------------------------------------------------------ sandbox

/**
 * Runs a command with no network (`unshare -rn`: its own network namespace,
 * with only loopback brought up) and only the given environment (`env -i`).
 * The machine has real provider keys, so the runner never starts any other
 * way.
 */
// macOS has no network namespaces: sandbox-exec denies every outbound
// connection except loopback. assertOffline proves it either way.
const MAC_OFFLINE_PROFILE =
  '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))';

function sandboxed(command, args, env, options = {}) {
  const pairs = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  if (process.platform === "darwin") {
    return spawn(
      "/usr/bin/sandbox-exec",
      ["-p", MAC_OFFLINE_PROFILE, "/usr/bin/env", "-i", ...pairs, command, ...args],
      { env: {}, ...options }
    );
  }
  return spawn(
    "/usr/bin/unshare",
    ["-rn", "/usr/bin/env", "-i", ...pairs, "/bin/sh", "-c", 'ip link set lo up && exec "$@"', "sh", command, ...args],
    { env: {}, ...options }
  );
}

function sandboxEnv(home, tmp, path = "/usr/bin") {
  const env = { HOME: home, PATH: path, TMPDIR: tmp };
  // Only the software Vulkan driver, never the real GPU.
  if (existsSync(LAVAPIPE)) {
    env.VK_ICD_FILENAMES = LAVAPIPE;
    env.VK_DRIVER_FILES = LAVAPIPE;
  }
  return env;
}

function collect(child, timeoutMs) {
  return new Promise((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolvePromise({ status, signal, stdout, stderr, timedOut });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolvePromise({ status: null, signal: null, stdout, stderr: String(err), timedOut });
    });
  });
}

/** Fails the run unless the sandbox really has no network. */
async function assertOffline(env) {
  const probe = "require('net').connect({host:'1.1.1.1',port:443}).on('connect',()=>{console.log('ONLINE');process.exit(0)}).on('error',(e)=>{console.log('OFFLINE '+e.code);process.exit(0)})";
  const r = await collect(sandboxed(process.execPath, ["-e", probe], env), 10_000);
  if (!r.stdout.startsWith("OFFLINE")) {
    throw new Error(`sandbox is not offline (${r.stdout.trim() || r.stderr.trim()}); refusing to run`);
  }
}

// ------------------------------------------------------------------ guest

/** Builds and compiles the parity guest, as parity/run.mjs does. */
async function buildGuest(opts, env) {
  const js = join(opts.out, "guest-parity.js");
  const bin = join(opts.out, "guest-parity.bin");
  const build = await collect(
    sandboxed(process.execPath, [join(ROOT, "guest", "build.mjs"), js, "--profile", "parity"], env, { cwd: ROOT }),
    300_000
  );
  if (build.status !== 0) throw new Error(`parity guest build failed:\n${build.stderr}`);
  const compile = await collect(sandboxed(opts.runner, ["compile", "--bundle", js, "--out", bin], env), 300_000);
  return compile.status === 0 ? bin : js;
}

// ------------------------------------------------------------------ examples

/** A Comfy example: any `comfy.*` node. The native runner does not run these. */
function isComfy(graph) {
  return graph.nodes.some((n) => typeof n.type === "string" && n.type.startsWith("comfy."));
}

/** True when every runnable node is a `comfy.*` node or a workflow Input or Output (isComfyGraph in @nodetool-ai/protocol). */
function isPureComfy(graph) {
  const editorOnly = new Set([
    "nodetool.workflows.base_node.Comment",
    "nodetool.workflows.base_node.Group",
    "nodetool.workflows.base_node.Preview",
    "nodetool.control.Reroute"
  ]);
  let comfy = 0;
  for (const { type } of graph.nodes) {
    if (editorOnly.has(type) || type.startsWith("nodetool.input.") || type.startsWith("nodetool.output.")) continue;
    if (!type.startsWith("comfy.")) return false;
    comfy += 1;
  }
  return comfy > 0;
}

/**
 * The example's status under tests/example-workflows-execute.test.ts. That
 * suite collapses a pure Comfy graph into the cloud runner node, which it
 * skips, and drops `comfy.*` nodes from a mixed graph.
 */
function tsStatus(file, graph) {
  if (isPureComfy(graph) || unrunnableNodeTypes(graph).length > 0) return "skipped";
  return CANNOT_COMPLETE[file] === undefined ? "completes" : "cannot complete";
}

/** An example uses providers when a model field names a provider after preparation. */
function usesProviders(graph) {
  return graph.nodes.some((n) =>
    Object.values(n.data ?? {}).some(
      (v) => v && typeof v === "object" && typeof v.type === "string" && v.type.endsWith("_model") && Boolean(v.provider)
    )
  );
}

function loadExamples(opts) {
  return readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .filter((f) => opts.only.length === 0 || opts.only.some((o) => f.includes(o)))
    .map((file) => ({ file, graph: JSON.parse(readFileSync(join(EXAMPLES_DIR, file), "utf8")).graph }));
}

function slug(file) {
  return file.replace(/\.json$/, "").replace(/[^\w.-]+/g, "-");
}

// ------------------------------------------------------------------ runs

const BEFORE_EXECUTION = "Before execution: ";

/**
 * The first error line, stable across runs: paths under the work directory,
 * the repository and HOME, generated ids, timestamps and durations are
 * replaced.
 */
function stableError(text, runDir) {
  const lines = String(text).split("\n").filter((l) => l.trim());
  // A graph the runner refuses before any node runs: its first issue.
  let s = /^Graph validation failed/.test(lines[0] ?? "") && lines[1]
    ? `${BEFORE_EXECUTION}${lines[1].trim().replace(/^- /, "")}`
    : lines[0] ?? "";
  for (const [path, name] of [
    [runDir, "$RUN"],
    [REPO, "$REPO"],
    [HOME, "$HOME"]
  ]) {
    s = s.replaceAll(path, name);
  }
  s = s
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\b[0-9a-f]{32}\b/gi, "<id>")
    .replace(/\b\d{4}-\d{2}-\d{2}[-T ]\d{2}[-:]\d{2}[-:]\d{2}(\.\d+)?Z?\b/g, "$TIME")
    .replace(/\b\d+(\.\d+)? ?ms\b/g, "<n> ms")
    .trim();
  return s.length > 300 ? `${s.slice(0, 300)}...` : s;
}

function errorOf(messages) {
  const job = messages.filter((m) => m.type === "job_update" && m.status === "failed" && m.error).at(-1);
  if (job) return String(job.error);
  const node = messages.find((m) => m.type === "node_update" && m.status === "error" && m.error);
  return node ? String(node.error) : null;
}

async function runExample(example, opts, bundle, home) {
  const runDir = join(opts.out, "runs", slug(example.file));
  rmSync(runDir, { recursive: true, force: true });
  const dirs = Object.fromEntries(["workspace", "assets", "sqlite", "tmp"].map((d) => [d, join(runDir, d)]));
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
  const graphFile = join(runDir, "graph.json");
  writeFileSync(graphFile, JSON.stringify({ nodes: example.prepared.nodes, edges: example.prepared.edges }));
  const args = [
    "run", "--bundle", bundle, "--graph", graphFile,
    "--workspace", dirs.workspace, "--asset-dir", dirs.assets,
    "--sqlite-dir", dirs.sqlite, "--models-db", "models.sqlite",
    "--package-assets", PACKAGE_ASSETS, "--allow-media", "--fake-providers",
    // The encoders the node editor grants (WorkflowSession.cpp).
    ...["libx264", "aac", "libmp3lame", "libopus"].flatMap((name) => ["--media-encoder", name])
  ];
  const r = await collect(sandboxed(opts.runner, args, sandboxEnv(home, dirs.tmp)), opts.timeout);
  writeFileSync(join(runDir, "stdout.jsonl"), r.stdout);
  writeFileSync(join(runDir, "stderr.log"), r.stderr);
  if (r.timedOut) return { status: "timeout" };
  const { messages } = parseStream(r.stdout);
  if (finalStatus(messages) === "completed") return { status: "completed" };
  const raw =
    errorOf(messages) ??
    (r.signal
      ? `native runner killed by ${r.signal}`
      : `exit ${r.status}, no error message: ${r.stderr.trim().split("\n").at(-1) ?? ""}`);
  return { status: "failed", error: stableError(raw, realpathSync(runDir)) };
}

async function runAll(examples, opts, bundle, home, log) {
  const queue = [...examples];
  let done = 0;
  await Promise.all(
    Array.from({ length: opts.jobs }, async () => {
      while (queue.length > 0) {
        const example = queue.shift();
        Object.assign(example.result, await runExample(example, opts, bundle, home));
        done++;
        log(`${done}/${examples.length} ${example.result.status.padEnd(9)} ${example.file}`);
      }
    })
  );
}

// ------------------------------------------------------------------ report

/** The failure reason an error groups under: the missing guest method when one is named, else the first node's message. */
function reasonOf(error) {
  const missing = /([\w@/.-]+ is unavailable in the native runner)/.exec(error);
  if (missing) return missing[1];
  return error.replace(/^Node "[^"]*" failed: /, "").split(/; Node "/)[0];
}

/** The module contract reason (server-only, not-yet-ported, ...) of a failure before execution. */
function unavailableReasonOf(error) {
  return /is unavailable in the native runner \(([\w-]+):/.exec(error)?.[1] ?? "other";
}

function rank(keys) {
  const counts = {};
  for (const key of keys) counts[key] = (counts[key] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function summarize(result) {
  const run = Object.entries(result.examples).filter(([, e]) => e.group === "run");
  const lines = ["# Native runner examples", ""];
  lines.push(`Runner: \`${result.runner}\`. Guest: \`${result.bundle}\`.`, "");
  lines.push("| Group | Examples | Provider-using | Provider-free |", "|---|---|---|---|");
  lines.push(`| comfy (not run) | ${result.counts.comfy} | | |`);
  lines.push(`| unrunnable (not run) | ${result.counts.unrunnable} | | |`);
  for (const status of OUTCOMES) {
    const hits = run.filter(([, e]) => e.status === status);
    const providers = hits.filter(([, e]) => e.providers).length;
    lines.push(`| ${status} | ${hits.length} | ${providers} | ${hits.length - providers} |`);
  }
  lines.push("");

  lines.push("## Failure reasons", "", "| Reason | Examples |", "|---|---|");
  for (const [reason, count] of rank(run.filter(([, e]) => e.status === "failed").map(([, e]) => reasonOf(e.error)))) {
    lines.push(`| ${reason.replaceAll("|", "\\|")} | ${count} |`);
  }
  lines.push("");

  const before = run.filter(([, e]) => e.status === "failed" && e.error.startsWith(BEFORE_EXECUTION));
  lines.push("## Failures before execution", "", `${before.length} failed examples were refused before any node ran, because a node's code reaches an unavailable export.`, "");
  lines.push("| Unavailable reason | Examples |", "|---|---|");
  for (const [reason, count] of rank(before.map(([, e]) => unavailableReasonOf(e.error)))) lines.push(`| ${reason} | ${count} |`);
  lines.push("");

  lines.push("## Native outcome by TypeScript status", "", `| TypeScript | ${OUTCOMES.join(" | ")} |`, `|---|${OUTCOMES.map(() => "---").join("|")}|`);
  for (const ts of ["completes", "cannot complete", "skipped"]) {
    lines.push(`| ${ts} | ${OUTCOMES.map((s) => run.filter(([, e]) => e.ts === ts && e.status === s).length).join(" | ")} |`);
  }
  lines.push("");

  lines.push("## Examples", "", "| Example | Native | TypeScript | Nodes not at parity | Error |", "|---|---|---|---|---|");
  for (const [file, e] of run) {
    const notAtParity = Object.entries(e.not_at_parity).map(([t, s]) => `\`${t}\` (${s})`).join(", ");
    lines.push(`| ${file} | ${e.status} | ${e.ts} | ${notAtParity} | ${(e.error ?? "").replaceAll("|", "\\|")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function printSummary(result) {
  const run = Object.values(result.examples).filter((e) => e.group === "run");
  console.log(`\ncomfy (not run): ${result.counts.comfy}, unrunnable (not run): ${result.counts.unrunnable}`);
  for (const status of OUTCOMES) {
    const hits = run.filter((e) => e.status === status);
    const providers = hits.filter((e) => e.providers).length;
    console.log(`${status}: ${hits.length} (provider-using ${providers}, provider-free ${hits.length - providers})`);
  }
  const before = run.filter((e) => e.status === "failed" && e.error.startsWith(BEFORE_EXECUTION));
  console.log(`failed before execution: ${before.length} (${rank(before.map((e) => unavailableReasonOf(e.error))).map(([r, n]) => `${r} ${n}`).join(", ")})`);
  const reasons = rank(run.filter((e) => e.status === "failed").map((e) => reasonOf(e.error)));
  if (reasons.length > 0) {
    console.log("\nfailure reasons:");
    for (const [reason, count] of reasons) console.log(`  ${String(count).padStart(3)}  ${reason}`);
  }
}

// ------------------------------------------------------------------ baseline

function baselineEntry(e) {
  if (e.group !== "run") return e;
  const entry = { group: e.group, status: e.status };
  if (e.error) entry.error = e.error;
  return { ...entry, providers: e.providers, ts: e.ts, nodes: e.nodes, not_at_parity: e.not_at_parity };
}

function outcome(e) {
  if (!e) return "not in the baseline";
  if (e.group !== "run") return e.group;
  return e.status === "failed" ? `failed: ${e.error}` : e.status;
}

function checkBaseline(result, opts) {
  if (!existsSync(BASELINE)) fail(`no baseline at ${BASELINE}; run with --update first`);
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")).examples;
  const inScope = (file) => opts.only.length === 0 || opts.only.some((o) => file.includes(o));
  const regressions = [];
  const improved = [];
  for (const [file, base] of Object.entries(baseline)) {
    if (!inScope(file)) continue;
    const now = result.examples[file];
    if (!now) regressions.push(`${file}: ${outcome(base)} -> no longer shipped`);
  }
  for (const [file, now] of Object.entries(result.examples)) {
    const base = baseline[file];
    if (outcome(base) === outcome(now)) continue;
    const line = `${file}: ${outcome(base)} -> ${outcome(now)}`;
    if (now.group === "run" && now.status === "completed") improved.push(line);
    else regressions.push(line);
  }
  if (improved.length > 0) {
    console.log(`\nFAIL: ${improved.length} example(s) now complete that the baseline does not record; record them with --update:`);
    for (const line of improved) console.log(`  ${line}`);
  }
  if (regressions.length > 0) {
    console.log(`\nFAIL: ${regressions.length} example(s) changed outcome:`);
    for (const line of regressions) console.log(`  ${line}`);
    console.log("Fix the regression, or record an intended change with --update.");
  }
  if (improved.length > 0 || regressions.length > 0) return false;
  console.log("\nPASS: every example has its baseline outcome.");
  return true;
}

function writeBaseline(result, opts) {
  // With --only, the other examples keep their baseline entries.
  const examples = opts.only.length > 0 && existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")).examples : {};
  for (const [file, e] of Object.entries(result.examples)) examples[file] = baselineEntry(e);
  const sorted = Object.fromEntries(Object.keys(examples).sort().map((f) => [f, examples[f]]));
  const counts = { comfy: 0, unrunnable: 0, completed: 0, failed: 0, timeout: 0 };
  for (const e of Object.values(sorted)) counts[e.group === "run" ? e.status : e.group]++;
  writeFileSync(BASELINE, JSON.stringify({ counts, examples: sorted }, null, 1) + "\n");
  console.log(`baseline written: ${BASELINE}`);
}

// ------------------------------------------------------------------ main

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(opts.out, { recursive: true });
  opts.out = realpathSync(opts.out);
  const home = join(opts.out, "sandbox", "home");
  const tmp = join(opts.out, "sandbox", "tmp");
  for (const d of [home, tmp]) mkdirSync(d, { recursive: true });
  const buildEnv = { ...sandboxEnv(home, tmp, `${dirname(process.execPath)}:/usr/bin:/bin`), NODE_ENV: "test" };
  await assertOffline(buildEnv);

  const t0 = Date.now();
  const log = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${msg}`);
  let bundle = opts.bundle;
  if (!bundle) {
    log("building the parity guest");
    bundle = await buildGuest(opts, buildEnv);
  }
  log(`guest: ${bundle}`);

  const parity = JSON.parse(readFileSync(PARITY_BASELINE, "utf8")).nodes;
  const result = { runner: opts.runner, bundle, examples: {} };
  const toRun = [];
  for (const { file, graph } of loadExamples(opts)) {
    const ts = tsStatus(file, graph);
    if (isComfy(graph)) {
      result.examples[file] = { group: "comfy", ts };
      continue;
    }
    const unrunnable = unrunnableNodeTypes(graph);
    if (unrunnable.length > 0) {
      result.examples[file] = { group: "unrunnable", ts, unrunnable: [...new Set(unrunnable)].sort() };
      continue;
    }
    const prepared = prepareForFakeRun(graph);
    const nodes = [...new Set(prepared.nodes.map((n) => n.type))].sort();
    const notAtParity = Object.fromEntries(
      nodes.filter((t) => parity[t]?.status !== "parity").map((t) => [t, parity[t]?.status ?? "not in parity baseline"])
    );
    const entry = { group: "run", ts, providers: usesProviders(prepared), nodes, not_at_parity: notAtParity };
    result.examples[file] = entry;
    toRun.push({ file, prepared, result: entry });
  }
  log(`${Object.keys(result.examples).length} examples, ${toRun.length} to run`);
  await runAll(toRun, opts, bundle, home, log);

  result.counts = { comfy: 0, unrunnable: 0, completed: 0, failed: 0, timeout: 0 };
  for (const e of Object.values(result.examples)) result.counts[e.group === "run" ? e.status : e.group]++;
  writeFileSync(join(opts.out, "result.json"), JSON.stringify(result, null, 1) + "\n");
  writeFileSync(join(opts.out, "summary.md"), summarize(result));
  console.log(`\nresult:  ${join(opts.out, "result.json")}\nsummary: ${join(opts.out, "summary.md")}\nruns:    ${join(opts.out, "runs")}`);
  printSummary(result);
  if (opts.update) writeBaseline(result, opts);
  if (opts.check) process.exit(checkBaseline(result, opts) ? 0 : 1);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(2);
});
