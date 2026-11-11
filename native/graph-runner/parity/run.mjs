// Parity suite: runs every case in parity/cases/ through the TypeScript
// reference and the native runner, compares the message streams with the
// conformance harness's comparison, and classifies every node in
// ALL_BASE_NODES. See parity/README.md.
//
//   node parity/run.mjs [--check | --update] [options]
//
// Options:
//   --runner <path>    native runner binary
//                      (default: ~/.cache/graph-runner-parity/snapshot/nodetool-graph-runner)
//   --bundle <path>    prebuilt parity guest (guest.js or guest.bin); default: build one
//   --only <text>      only nodes whose type contains <text> (repeatable)
//   --jobs <n>         native runs in parallel (default 4)
//   --ref-jobs <n>     reference processes (default 2)
//   --timeout <ms>     per-case timeout on each side (default 20000)
//   --out <dir>        work and result directory (default: build/parity)
//   --from <file>      classify nothing; read an earlier result.json (for --check/--update)
//   --check            exit 1 if a node the baseline lists as parity is no longer parity
//   --update           write the result into parity/baseline.json
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import * as conformance from "./compare.mjs";
import { capabilityExport, capabilityGroup, capabilityOf, offlineReasonFor, skipRuleFor } from "./rules.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const BASELINE = join(here, "baseline.json");
const CASES_DIR = join(here, "cases");
const HOME = process.env.HOME;
const STATUSES = ["parity", "mismatch", "native-unsupported", "reference-unavailable", "skipped"];

// ------------------------------------------------------------------ options

function parseArgs(argv) {
  const opts = {
    runner: join(HOME, ".cache/graph-runner-parity/snapshot/nodetool-graph-runner"),
    only: [],
    jobs: 4,
    refJobs: 2,
    timeout: 20_000,
    out: join(ROOT, "build", "parity")
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
    else if (arg === "--ref-jobs") opts.refJobs = Number(value());
    else if (arg === "--timeout") opts.timeout = Number(value());
    else if (arg === "--out") opts.out = resolve(value());
    else if (arg === "--from") opts.from = resolve(value());
    else if (arg === "--check") opts.check = true;
    else if (arg === "--update") opts.update = true;
    else fail(`unknown argument ${arg}`);
  }
  if (opts.check && opts.update) fail("--check and --update are exclusive");
  return opts;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(2);
}

// ------------------------------------------------------------------ sandbox

// Every child process runs without network (its own empty network namespace),
// with only these environment variables, from an empty working directory, so
// no .env file, keychain, provider key or local server is reachable.
function sandbox(work) {
  const home = join(work, "sandbox", "home");
  const cwd = join(work, "sandbox", "cwd");
  const tmp = join(work, "sandbox", "tmp");
  rmSync(join(work, "sandbox"), { recursive: true, force: true });
  for (const d of [home, cwd, tmp]) mkdirSync(d, { recursive: true });
  const lavapipe = "/usr/share/vulkan/icd.d/lvp_icd.json";
  const env = {
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    HOME: home,
    TMPDIR: tmp,
    NODE_ENV: "test",
    // Dawn sees only the software Vulkan driver, never the real GPU.
    ...(existsSync(lavapipe) ? { VK_ICD_FILENAMES: lavapipe, VK_DRIVER_FILES: lavapipe } : {})
  };
  return {
    cwd,
    spawn(command, args, options = {}) {
      return spawn("/usr/bin/env", ["-i", ...Object.entries(env).map(([k, v]) => `${k}=${v}`), "/usr/bin/unshare", "-rn", command, ...args], {
        cwd,
        ...options
      });
    }
  };
}

function collect(child, timeoutMs) {
  return new Promise((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, timeoutMs)
      : null;
    child.on("close", (status, signal) => {
      if (timer) clearTimeout(timer);
      resolvePromise({ status, signal, stdout, stderr, timedOut });
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolvePromise({ status: null, signal: null, stdout, stderr: String(err), timedOut });
    });
  });
}

/** Fails the run unless the sandbox really has no network. */
async function assertOffline(box) {
  const probe = "require('net').connect({host:'1.1.1.1',port:443}).on('connect',()=>{console.log('ONLINE');process.exit(0)}).on('error',(e)=>{console.log('OFFLINE '+e.code);process.exit(0)})";
  const r = await collect(box.spawn(process.execPath, ["-e", probe]), 10_000);
  if (!r.stdout.startsWith("OFFLINE")) {
    throw new Error(`sandbox is not offline (${r.stdout.trim() || r.stderr.trim()}); refusing to run`);
  }
}

// ------------------------------------------------------------------ cases

function loadCases() {
  const cases = [];
  for (const sub of ["generated", "hand"]) {
    const dir = join(CASES_DIR, sub);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
      const doc = JSON.parse(readFileSync(join(dir, file), "utf8"));
      for (const c of doc.cases) cases.push({ ...c, file: `${sub}/${file}` });
    }
  }
  const ids = new Set();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`duplicate case id ${c.id}`);
    ids.add(c.id);
  }
  return cases;
}

// ------------------------------------------------------------------ workspaces

// Every case runs with a workspace directory on each side, empty unless the
// case lists files: {"workspace": {"<relative path>": "<text>" | {"base64": "..."}}}.
// The two sides get separate copies, and their paths are replaced by
// $WORKSPACE in the messages before comparing.
function caseWorkspace(work, c, side) {
  const dir = join(work, "workspaces", c.id.replace(/[^\w.-]+/g, "_"), side);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [path, content] of Object.entries(c.workspace ?? {})) {
    const file = join(dir, path);
    if (!file.startsWith(`${dir}/`)) throw new Error(`case ${c.id}: workspace path ${path} leaves the workspace`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof content === "string" ? content : Buffer.from(content.base64, "base64"));
  }
  return realpathSync(dir);
}

/**
 * The messages as compared: workspace paths become $WORKSPACE, the
 * `%Y-%m-%d-%H-%M-%S` stamps save nodes put in default file names become
 * $TIME (the two sides run at different seconds), and bytes in
 * the native stream ({"__bytes__": "<base64>"}, guest/values.mjs) take the
 * form the reference's jsonSafe gives them, {"__bytes__": <length>}, or a
 * Buffer's {"type": "Buffer", "data": [...]}. QuickJS's wording of a
 * property read on null or undefined takes V8's, since the error is the same.
 */
function comparable(messages, workspace) {
  let text = JSON.stringify(messages);
  if (workspace) text = text.replaceAll(JSON.stringify(workspace).slice(1, -1), "$WORKSPACE");
  text = text.replace(/\b\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\b/g, "$TIME");
  text = text.replace(/cannot read property '([^'\\]+)' of (null|undefined)/g, "Cannot read properties of $2 (reading '$1')");
  return JSON.parse(text, function (_key, value) {
    if (value === null || typeof value !== "object" || typeof value.__bytes__ !== "string") return value;
    if (this.mimeType === "image/x-raw-rgba") return { __rgba__: value.__bytes__ };
    const bytes = Buffer.from(value.__bytes__, "base64");
    return value.__buffer__ ? { type: "Buffer", data: [...bytes] } : { __bytes__: bytes.length };
  });
}

// ------------------------------------------------------------------ guest

async function buildGuest(box, work) {
  const js = join(work, "guest-parity.js");
  const bin = join(work, "guest-parity.bin");
  const build = await collect(
    box.spawn(process.execPath, [join(ROOT, "guest", "build.mjs"), js, "--profile", "parity"], { cwd: ROOT }),
    300_000
  );
  if (build.status !== 0) throw new Error(`parity guest build failed:\n${build.stderr}`);
  return { js, bin };
}

async function compileGuest(box, opts, js, bin) {
  const r = await collect(box.spawn(opts.runner, ["compile", "--bundle", js, "--out", bin]), 300_000);
  return r.status === 0 ? bin : js;
}

const PROBE_GRAPH = {
  nodes: [
    { id: "probe", type: "nodetool.parity.Probe", properties: {} },
    { id: "out", type: "nodetool.output.Output", properties: { name: "report" } }
  ],
  edges: [{ id: "e1", source: "probe", sourceHandle: "output", target: "out", targetHandle: "value" }]
};

async function runProbe(box, opts, bundle, work, lib) {
  const file = join(work, "probe.json");
  writeFileSync(file, JSON.stringify(PROBE_GRAPH));
  const r = await collect(box.spawn(opts.runner, ["run", "--bundle", bundle, "--graph", file]), 120_000);
  const update = lib.parseStream(r.stdout).messages.find((m) => m.type === "output_update");
  if (!update) throw new Error(`load probe printed no report (exit ${r.status}):\n${r.stderr.slice(-2000)}`);
  return update.value;
}

// ------------------------------------------------------------------ reference

class ReferencePool {
  constructor(box, size, timeoutMs, logDir) {
    this.box = box;
    this.size = size;
    this.timeoutMs = timeoutMs;
    this.logDir = logDir;
    this.workers = [];
  }

  async start() {
    const started = await Promise.all(Array.from({ length: this.size }, (_, i) => this.spawnWorker(i)));
    this.workers = started;
    return started[0].inventory;
  }

  spawnWorker(index) {
    return new Promise((resolvePromise, reject) => {
      const log = join(this.logDir, `reference-${index}.log`);
      const child = this.box.spawn(process.execPath, ["--max-old-space-size=4096", join(here, "reference-batch.mjs")], {
        stdio: ["pipe", "pipe", "pipe", "pipe"]
      });
      const logLines = [];
      const keep = (d) => {
        logLines.push(String(d));
        if (logLines.length > 400) logLines.splice(0, 200);
      };
      child.stdout.on("data", keep);
      child.stderr.on("data", keep);
      const worker = { index, child, pending: null, inventory: null, logLines, log };
      const lines = createInterface({ input: child.stdio[3] });
      lines.on("line", (line) => {
        const msg = JSON.parse(line);
        if (msg.ready) {
          worker.inventory = msg.inventory;
          resolvePromise(worker);
          return;
        }
        const pending = worker.pending;
        worker.pending = null;
        pending?.resolve(msg);
      });
      child.on("close", (status, signal) => {
        writeFileSync(log, logLines.join(""));
        worker.dead = true;
        if (!worker.inventory) reject(new Error(`reference failed to start (exit ${status} ${signal ?? ""}); log: ${log}`));
        worker.pending?.resolve({ crashed: true, status, signal });
        worker.pending = null;
      });
    });
  }

  async run(worker, request) {
    if (worker.dead) {
      const fresh = await this.spawnWorker(worker.index);
      Object.assign(worker, fresh);
    }
    const result = await new Promise((resolvePromise) => {
      worker.pending = { resolve: resolvePromise };
      // Watchdog for a run that blocks the event loop past its own timeout.
      const timer = setTimeout(() => {
        if (worker.pending) worker.child.kill("SIGKILL");
      }, this.timeoutMs + 15_000);
      worker.child.stdin.write(JSON.stringify({ ...request, timeout_ms: this.timeoutMs }) + "\n");
      worker.pending.resolve = (msg) => {
        clearTimeout(timer);
        resolvePromise(msg);
      };
    });
    if (result.crashed) {
      return { id: request.id, messages: [], timed_out: false, crashed: `reference process died (${result.signal ?? `exit ${result.status}`})` };
    }
    return result;
  }

  async runAll(requests, onDone) {
    const queue = [...requests];
    const results = new Map();
    await Promise.all(
      this.workers.map(async (worker) => {
        while (queue.length > 0) {
          const request = queue.shift();
          results.set(request.id, await this.run(worker, request));
          onDone?.();
        }
      })
    );
    return results;
  }

  stop() {
    for (const w of this.workers) {
      if (!w.dead) w.child.stdin.end();
    }
  }
}

// ------------------------------------------------------------------ native

async function runNativeAll(box, opts, bundle, cases, graphDir, onDone) {
  mkdirSync(graphDir, { recursive: true });
  const queue = [...cases];
  const results = new Map();
  await Promise.all(
    Array.from({ length: opts.jobs }, async () => {
      while (queue.length > 0) {
        const c = queue.shift();
        const file = join(graphDir, `${c.id.replace(/[^\w.-]+/g, "_")}.json`);
        writeFileSync(file, JSON.stringify(c.graph));
        const args = ["run", "--bundle", bundle, "--graph", file, "--workspace", c.workspaces.native, "--allow-media"];
        if (c.params) args.push("--params", JSON.stringify(c.params));
        results.set(c.id, await collect(box.spawn(opts.runner, args), opts.timeout + 10_000));
        onDone?.();
      }
    })
  );
  return results;
}

// ------------------------------------------------------------------ classify

function errorsOf(messages) {
  const errors = [];
  for (const m of messages) {
    if (m.type === "job_update" && m.status === "failed" && m.error) errors.push(String(m.error));
    if (m.type === "node_update" && m.status === "error" && m.error) errors.push(String(m.error));
  }
  return [...new Set(errors)];
}

function clip(text, n = 300) {
  const s = String(text);
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

function classifyCase(c, refRaw, nat, lib) {
  if (refRaw.crashed) return { status: "reference-unavailable", reason: refRaw.crashed };
  const ref = { ...refRaw, messages: comparable(refRaw.messages, c.workspaces?.reference) };
  if (ref.timed_out) return { status: "reference-unavailable", reason: "reference run timed out" };
  if (ref.error && ref.messages.length === 0) return { status: "reference-unavailable", reason: `reference threw: ${clip(ref.error)}` };
  const refStatus = lib.finalStatus(ref.messages);
  const refErrors = errorsOf(ref.messages);
  if (refStatus === "failed") {
    const offline = offlineReasonFor(refErrors);
    if (offline) return { status: "reference-unavailable", reason: `needs ${offline.id}: ${clip(offline.error)}`, offline: offline.id };
  }

  if (nat.timedOut) return { status: "mismatch", reason: "native run timed out", native_fault: "timeout" };
  if (nat.signal) return { status: "mismatch", reason: `native runner killed by ${nat.signal}`, native_fault: nat.signal };
  const parsed = lib.parseStream(nat.stdout);
  parsed.messages = comparable(parsed.messages, c.workspaces?.native);
  if (nat.status === 2 || parsed.messages.length === 0) {
    return { status: "mismatch", reason: `native runner printed no messages (exit ${nat.status}): ${clip(nat.stderr.trim().split("\n").slice(-2).join(" | "))}`, native_fault: "no-output" };
  }
  const stats = { images: [] };
  const diffs = lib.diffStreams(lib.toStreams(ref.messages), lib.toStreams(parsed.messages), stats);
  // Image values compared by pixel (compare.mjs): the largest difference.
  const images =
    stats.images.length > 0
      ? { compared: stats.images.length, max_difference: Math.max(...stats.images.map((i) => i.max)) }
      : undefined;
  if (diffs.length === 0) {
    return refStatus === "completed"
      ? { status: "parity", reason: "streams match, job completed", images }
      : { status: "parity", reason: `streams match, both jobs failed: ${clip(refErrors[0] ?? "no error message")}`, error_path: true, images };
  }

  const natStatus = lib.finalStatus(parsed.messages);
  const natErrors = errorsOf(parsed.messages).filter((e) => !refErrors.includes(e));
  const named = natErrors.map(capabilityOf).find(Boolean);
  if (named) return { status: "native-unsupported", reason: clip(natErrors.find((e) => capabilityOf(e) === named)), capability: named, divergence: diffs[0] };
  if (refStatus === "completed" && natStatus === "failed") {
    return { status: "native-unsupported", reason: clip(natErrors[0] ?? "native job failed"), capability: `guest error: ${clip(natErrors[0] ?? "unknown", 80)}`, divergence: diffs[0] };
  }
  return { status: "mismatch", reason: `first divergence: ${clip(diffs[0], 1200)}`, divergence: diffs[0], images };
}

/** One status per node from its cases. Cases the reference cannot run say nothing when another case was measured. */
function classifyNode(cases) {
  const measured = cases.filter((c) => c.status !== "reference-unavailable");
  const pool = measured.length > 0 ? measured : cases;
  for (const status of ["mismatch", "native-unsupported", "reference-unavailable"]) {
    const hit = pool.find((c) => c.status === status);
    if (hit) return { status, reason: hit.reason, capability: hit.capability, case: hit.id };
  }
  const errorPath = pool.every((c) => c.error_path);
  return {
    status: "parity",
    reason: errorPath ? `${pool.length} case(s) match; every reference run failed, so only the error path is covered` : `${pool.length} case(s) match`,
    error_path_only: errorPath || undefined
  };
}

// ------------------------------------------------------------------ report

function summaryMarkdown(result) {
  const nodes = Object.entries(result.nodes);
  const lines = ["# Native runner parity", ""];
  lines.push(`Runner: \`${result.runner}\`. Guest: \`${result.bundle}\`.`, "");
  lines.push("| Status | Nodes |", "|---|---|");
  for (const s of STATUSES) lines.push(`| ${s} | ${result.counts[s] ?? 0} |`);
  lines.push(`| total | ${nodes.length} |`, "");

  lines.push("## By package", "", `| Package | ${STATUSES.join(" | ")} |`, `|---|${STATUSES.map(() => "---").join("|")}|`);
  const byPackage = {};
  for (const [, n] of nodes) {
    byPackage[n.package] ??= Object.fromEntries(STATUSES.map((s) => [s, 0]));
    byPackage[n.package][n.status]++;
  }
  for (const [pkg, counts] of Object.entries(byPackage).sort()) {
    lines.push(`| ${pkg.replace("@nodetool-ai/", "")} | ${STATUSES.map((s) => counts[s]).join(" | ")} |`);
  }
  lines.push("");

  const parity = nodes.filter(([, n]) => n.status === "parity");
  lines.push("## At parity", "");
  for (const [type, n] of parity) lines.push(`- \`${type}\`${n.error_path_only ? " (error path only)" : ""}`);
  lines.push("");

  lines.push("## What blocks native-unsupported nodes", "", "| Capability | Nodes |", "|---|---|");
  for (const [cap, count] of result.capabilities.groups) lines.push(`| ${cap} | ${count} |`);
  lines.push("", "By export, across the modules that re-export it:", "", "| Capability | Nodes |", "|---|---|");
  for (const [cap, count] of result.capabilities.exports) lines.push(`| ${cap} | ${count} |`);
  lines.push("", "Exact capabilities:", "", "| Capability | Nodes |", "|---|---|");
  for (const [cap, count] of result.capabilities.exact) lines.push(`| ${cap} | ${count} |`);
  lines.push("");

  const imageCases = nodes.flatMap(([type, n]) => (n.cases ?? []).filter((c) => c.images).map((c) => [type, c]));
  if (imageCases.length > 0) {
    lines.push(
      "## Image differences",
      "",
      `Largest premultiplied per-channel difference per case, in 8-bit levels (tolerance ${conformance.PIXEL_TOLERANCE}).`,
      "",
      "| Case | Images | Max |",
      "|---|---|---|"
    );
    for (const [, c] of imageCases) lines.push(`| \`${c.id}\` | ${c.images.compared} | ${c.images.max_difference} |`);
    lines.push("");
  }

  const mismatches = nodes.filter(([, n]) => n.status === "mismatch");
  lines.push("## Mismatches", "");
  if (mismatches.length === 0) lines.push("None.");
  for (const [type, n] of mismatches) {
    lines.push(`- \`${type}\` (case \`${n.case}\`):`, "", "  ```", ...String(n.reason).split("\n").map((l) => `  ${l}`), "  ```");
  }
  lines.push("");

  lines.push("## Reference unavailable", "", "| Reason | Nodes |", "|---|---|");
  const offline = {};
  for (const [, n] of nodes.filter(([, n]) => n.status === "reference-unavailable")) {
    const key = /^needs (\S+):/.exec(n.reason)?.[1] ?? n.reason.split(":")[0];
    offline[key] = (offline[key] ?? 0) + 1;
  }
  for (const [k, v] of Object.entries(offline).sort((a, b) => b[1] - a[1])) lines.push(`| ${k} | ${v} |`);
  lines.push("");

  lines.push("## Skipped", "", "| Rule | Nodes |", "|---|---|");
  const skipped = {};
  for (const [, n] of nodes.filter(([, n]) => n.status === "skipped")) skipped[n.rule] = (skipped[n.rule] ?? 0) + 1;
  for (const [k, v] of Object.entries(skipped).sort((a, b) => b[1] - a[1])) lines.push(`| ${k} | ${v} |`);
  lines.push("");
  return lines.join("\n");
}

function rank(entries) {
  const counts = {};
  for (const key of entries) counts[key] = (counts[key] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// ------------------------------------------------------------------ baseline

function checkBaseline(result, opts) {
  if (!existsSync(BASELINE)) fail(`no baseline at ${BASELINE}; run with --update first`);
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")).nodes;
  const inScope = (type) => opts.only.length === 0 || opts.only.some((o) => type.includes(o));
  const regressions = [];
  const improved = [];
  for (const [type, base] of Object.entries(baseline)) {
    if (!inScope(type)) continue;
    const now = result.nodes[type];
    if (base.status === "parity" && now?.status !== "parity") {
      regressions.push(`${type}: parity -> ${now ? `${now.status}: ${clip(now.reason, 400)}` : "missing from this run"}`);
    }
  }
  for (const [type, now] of Object.entries(result.nodes)) {
    if (now.status === "parity" && baseline[type]?.status !== "parity") improved.push(`${type} (was ${baseline[type]?.status ?? "not in baseline"})`);
  }
  if (improved.length > 0) {
    console.log(`\n${improved.length} node(s) newly at parity; record them with --update:`);
    for (const line of improved) console.log(`  ${line}`);
  }
  if (regressions.length > 0) {
    console.log(`\nFAIL: ${regressions.length} node(s) dropped from parity:`);
    for (const line of regressions) console.log(`  ${line}`);
    return false;
  }
  console.log("\nPASS: every node at parity in the baseline is still at parity.");
  return true;
}

function writeBaseline(result, opts) {
  // With --only, the other nodes keep their baseline entries.
  const nodes =
    opts.only.length > 0 && existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")).nodes : {};
  for (const type of Object.keys(result.nodes).sort()) {
    const n = result.nodes[type];
    nodes[type] = { status: n.status, package: n.package, reason: clip(n.reason, 300) };
  }
  const sorted = Object.fromEntries(Object.keys(nodes).sort().map((t) => [t, nodes[t]]));
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const n of Object.values(sorted)) counts[n.status]++;
  writeFileSync(BASELINE, JSON.stringify({ counts, nodes: sorted }, null, 1) + "\n");
  console.log(`baseline written: ${BASELINE}`);
}

// ------------------------------------------------------------------ main

async function classifyAll(opts) {
  const work = opts.out;
  mkdirSync(work, { recursive: true });
  const box = sandbox(work);
  await assertOffline(box);
  const lib = conformance;
  const cases = loadCases();

  const t0 = Date.now();
  const log = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${msg}`);

  let bundle = opts.bundle;
  if (!bundle) {
    log("building the parity guest");
    const { js, bin } = await buildGuest(box, work);
    bundle = await compileGuest(box, opts, js, bin);
  }
  log(`guest: ${bundle}`);

  log("starting the reference");
  const pool = new ReferencePool(box, opts.refJobs, opts.timeout, work);
  const inventory = await pool.start();
  writeFileSync(join(work, "inventory.json"), JSON.stringify(inventory, null, 1) + "\n");

  log("probing the guest");
  const probe = await runProbe(box, opts, bundle, work, lib);
  writeFileSync(join(work, "probe.json"), JSON.stringify(probe, null, 1) + "\n");

  const inScope = (type) => opts.only.length === 0 || opts.only.some((o) => type.includes(o));
  const nodes = inventory.filter((n) => inScope(n.type));
  const casesByNode = new Map();
  for (const c of cases) {
    if (!casesByNode.has(c.node)) casesByNode.set(c.node, []);
    casesByNode.get(c.node).push(c);
  }

  const loadErrors = new Map();
  for (const m of probe.modules) if (!m.ok) loadErrors.set(m.module, m.error);
  const nativeMissing = (type) => {
    if (type === "nodetool.output.Output") return null;
    const entry = probe.nodes[type];
    if (!entry) return { reason: "class did not load in the guest", error: null };
    if (!entry.registered) return { reason: "registry entry failed in the guest", error: entry.error };
    if (!entry.instantiated) return { reason: "constructor failed in the guest", error: entry.error };
    return null;
  };
  const inventoryByType = new Map(inventory.map((n) => [n.type, n]));

  const result = { runner: opts.runner, bundle, nodes: {}, modules: probe.modules };
  const toRun = [];
  for (const node of nodes) {
    const base = { package: node.package, module: node.module };
    const rule = skipRuleFor(node);
    if (rule) {
      result.nodes[node.type] = { ...base, status: "skipped", rule: rule.id, reason: `skip rule ${rule.id}: ${rule.reason}` };
      continue;
    }
    const nodeCases = casesByNode.get(node.type) ?? [];
    if (nodeCases.length === 0) {
      result.nodes[node.type] = { ...base, status: "skipped", rule: "no-case", reason: "no case; run parity/generate-cases.mjs" };
      continue;
    }
    const missing = nativeMissing(node.type);
    if (missing) {
      const inBundle = probe.modules.some((m) => m.module === node.module);
      const error =
        missing.error ??
        loadErrors.get(node.module) ??
        (inBundle ? "module loaded but did not export the class" : `module ${node.module} is not in the guest bundle`);
      const capability = capabilityOf(error) ?? `guest error: ${clip(error, 80)}`;
      result.nodes[node.type] = { ...base, status: "native-unsupported", reason: `${missing.reason}: ${clip(error)}`, capability };
      continue;
    }
    for (const c of nodeCases) {
      const helperMissing = c.graph.nodes
        .map((n) => n.type)
        .filter((t) => t !== node.type && inventoryByType.has(t))
        .map((t) => [t, nativeMissing(t)])
        .find(([, m]) => m);
      c.preclassified = helperMissing
        ? { status: "native-unsupported", reason: `helper ${helperMissing[0]}: ${helperMissing[1].reason}`, capability: `helper node ${helperMissing[0]}` }
        : null;
      toRun.push(c);
    }
    result.nodes[node.type] = { ...base, cases: [] };
  }

  const runnable = toRun.filter((c) => !c.preclassified);
  rmSync(join(work, "workspaces"), { recursive: true, force: true });
  for (const c of runnable) {
    c.workspaces = { reference: caseWorkspace(work, c, "reference"), native: caseWorkspace(work, c, "native") };
  }
  const refRequest = (c) => ({ id: c.id, graph: c.graph, params: c.params, workspace: c.workspaces.reference });
  log(`${nodes.length} nodes, ${runnable.length} cases to run on both sides`);
  let refDone = 0;
  let natDone = 0;
  const progress = setInterval(() => log(`reference ${refDone}/${runnable.length}, native ${natDone}/${runnable.length}`), 15_000);
  const [refResults, natResults] = await Promise.all([
    pool.runAll(runnable.map(refRequest), () => refDone++),
    runNativeAll(box, opts, bundle, runnable, join(work, "graphs"), () => natDone++)
  ]);
  clearInterval(progress);
  pool.stop();
  log("runs finished");

  // A mismatch is only a mismatch if the reference repeats itself.
  const mismatched = runnable.filter((c) => classifyCase(c, refResults.get(c.id), natResults.get(c.id), lib).status === "mismatch");
  let rerun = new Map();
  if (mismatched.length > 0) {
    log(`re-running ${mismatched.length} mismatched case(s) on the reference`);
    const again = new ReferencePool(box, 1, opts.timeout, join(work, "rerun"));
    mkdirSync(join(work, "rerun"), { recursive: true });
    await again.start();
    for (const c of mismatched) c.workspaces.reference = caseWorkspace(work, c, "reference");
    rerun = await again.runAll(mismatched.map(refRequest));
    again.stop();
  }

  for (const c of toRun) {
    let verdict = c.preclassified;
    if (!verdict) {
      const ref = refResults.get(c.id);
      verdict = classifyCase(c, ref, natResults.get(c.id), lib);
      if (verdict.status === "mismatch" && rerun.has(c.id)) {
        const second = rerun.get(c.id);
        const self = lib.diffStreams(
          lib.toStreams(comparable(ref.messages, c.workspaces.reference)),
          lib.toStreams(comparable(second.messages ?? [], c.workspaces.reference))
        );
        if (self.length > 0) verdict.reason = `reference is not deterministic (${clip(self[0], 400)}); ${verdict.reason}`;
      }
      writeFileSync(join(work, "graphs", `${c.id.replace(/[^\w.-]+/g, "_")}.reference.jsonl`), ref.messages.map((m) => JSON.stringify(m)).join("\n") + "\n");
    }
    result.nodes[c.node].cases.push({ id: c.id, file: c.file, ...verdict });
  }
  for (const n of Object.values(result.nodes)) {
    if (n.cases) Object.assign(n, classifyNode(n.cases));
  }

  result.counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const n of Object.values(result.nodes)) result.counts[n.status]++;
  const blocked = Object.values(result.nodes).filter((n) => n.status === "native-unsupported" && n.capability);
  result.capabilities = {
    groups: rank(blocked.map((n) => capabilityGroup(n.capability))),
    exports: rank(blocked.map((n) => capabilityExport(n.capability))),
    exact: rank(blocked.map((n) => n.capability))
  };
  log("classified");
  return result;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const result = opts.from ? JSON.parse(readFileSync(opts.from, "utf8")) : await classifyAll(opts);
  if (!opts.from) {
    writeFileSync(join(opts.out, "result.json"), JSON.stringify(result, null, 1) + "\n");
    writeFileSync(join(opts.out, "summary.md"), summaryMarkdown(result));
    console.log(`\nresult:  ${join(opts.out, "result.json")}\nsummary: ${join(opts.out, "summary.md")}`);
  }
  console.log(STATUSES.map((s) => `${s}: ${result.counts[s] ?? 0}`).join(", "));
  if (opts.update) writeBaseline(result, opts);
  if (opts.check) process.exit(checkBaseline(result, opts) ? 0 : 1);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(2);
});
