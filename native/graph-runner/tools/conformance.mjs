// Conformance harness: proves the C++ graph runner emits the same message
// stream as the TypeScript kernel for every fixture in tests/graphs/.
//
//   node conformance.mjs --runner <binary> --bundle <path> [fixture...]
//   node conformance.mjs --reference-only [fixture...]
//   node conformance.mjs --compare <a.jsonl> <b.jsonl>
//
// Run it with Node 24 from any directory. Exit 0 when every check passes.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const GRAPHS_DIR = resolve(here, "../tests/graphs");
const TS_REFERENCE = join(here, "ts-reference.mjs");
const REPO_ROOT = resolve(here, "../../..");
const REFERENCE_RUNS = 3;
const PROCESS_TIMEOUT_MS = 120_000;

// Fields dropped from every message before comparison. Each entry needs a
// reason. Keep this list short: anything not listed here is compared strictly.
//
// `properties` is deliberately NOT listed. In the reference it differs per
// message type for the same node: node_update carries the node's static
// properties (RepeatCount shows {count:1}), while generation_complete carries
// the resolved input values the node ran with (RepeatCount shows {count:3};
// streaming nodes show null). Both are deterministic and a client can render
// them, so a runner that resolves inputs differently is observably wrong.
const IGNORED_FIELDS = {
  // Nothing needs excluding yet. Add `fieldName: "reason"` here, not inline.
};

const EXIT_FOR_STATUS = { completed: 0, failed: 1 };

function usage(message) {
  if (message) console.error(`error: ${message}\n`);
  console.error(
    "usage:\n" +
      "  conformance.mjs --runner <binary> --bundle <path> [fixture...]\n" +
      "  conformance.mjs --reference-only [fixture...]\n" +
      "  conformance.mjs --compare <a.jsonl> <b.jsonl>"
  );
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { fixtures: [], referenceOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) usage(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === "--runner") opts.runner = value();
    else if (arg === "--bundle") opts.bundle = value();
    else if (arg === "--reference-only") opts.referenceOnly = true;
    else if (arg === "--compare") opts.compare = [value(), value()];
    else if (arg.startsWith("--")) usage(`unknown option ${arg}`);
    else opts.fixtures.push(arg);
  }
  return opts;
}

// ---------------------------------------------------------------- parsing

/** Parses a JSON-lines stream. Lines that do not start with "{" are ignored. */
export function parseStream(text) {
  const messages = [];
  const problems = [];
  text.split("\n").forEach((line, i) => {
    if (!line.startsWith("{")) return;
    try {
      messages.push(JSON.parse(line));
    } catch (err) {
      problems.push(`line ${i + 1} is not valid JSON: ${err.message}`);
    }
  });
  return { messages, problems };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])])
    );
  }
  return value;
}

function streamKey(message) {
  if (message.type === "job_update") return "job";
  if (message.type === "edge_update") return `edge ${message.edge_id}`;
  if (message.node_id !== undefined) return `node ${message.node_id}`;
  return `other ${message.type}`;
}

/** Groups messages by stream, keeping each stream's order. */
export function toStreams(messages) {
  const streams = new Map();
  for (const message of messages) {
    const kept = { ...message };
    for (const field of Object.keys(IGNORED_FIELDS)) delete kept[field];
    const key = streamKey(message);
    if (!streams.has(key)) streams.set(key, []);
    streams.get(key).push(canonical(kept));
  }
  return streams;
}

export function finalStatus(messages) {
  const updates = messages.filter((m) => m.type === "job_update");
  return updates.length > 0 ? updates[updates.length - 1].status : null;
}

// ---------------------------------------------------------------- diffing

function fieldDiffs(a, b, path = "") {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  if (isObj(a) && isObj(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys.flatMap((k) => fieldDiffs(a[k], b[k], path ? `${path}.${k}` : k));
  }
  return [`${path || "(value)"}: expected ${JSON.stringify(a)}, got ${JSON.stringify(b)}`];
}

/** Returns one text block per stream whose messages differ, or []. */
export function diffStreams(expected, actual) {
  const diffs = [];
  const keys = [...new Set([...expected.keys(), ...actual.keys()])].sort();
  for (const key of keys) {
    const want = expected.get(key);
    const got = actual.get(key);
    if (!want) {
      diffs.push(`[${key}] not in reference, runner emitted ${got.length} message(s); first: ${JSON.stringify(got[0])}`);
      continue;
    }
    if (!got) {
      diffs.push(`[${key}] missing from runner, reference has ${want.length} message(s); first: ${JSON.stringify(want[0])}`);
      continue;
    }
    const n = Math.max(want.length, got.length);
    for (let i = 0; i < n; i++) {
      if (JSON.stringify(want[i]) === JSON.stringify(got[i])) continue;
      const lines = [`[${key}] first divergence at message ${i + 1} of ${want.length} expected, ${got.length} received`];
      if (want[i] === undefined) lines.push(`  extra message from runner: ${JSON.stringify(got[i])}`);
      else if (got[i] === undefined) lines.push(`  runner stopped early, expected: ${JSON.stringify(want[i])}`);
      else {
        lines.push(`  expected: ${JSON.stringify(want[i])}`);
        lines.push(`  received: ${JSON.stringify(got[i])}`);
        for (const d of fieldDiffs(want[i], got[i])) lines.push(`  field ${d}`);
      }
      diffs.push(lines.join("\n"));
      break;
    }
  }
  return diffs;
}

// ---------------------------------------------------------------- running

function listFixtures() {
  return readdirSync(GRAPHS_DIR)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".params.json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

function fixtureFiles(name) {
  const graph = join(GRAPHS_DIR, `${name}.json`);
  if (!existsSync(graph)) throw new Error(`no fixture graph ${graph}`);
  const paramsFile = join(GRAPHS_DIR, `${name}.params.json`);
  const params = existsSync(paramsFile)
    ? JSON.stringify(JSON.parse(readFileSync(paramsFile, "utf8")))
    : null;
  return { graph, params };
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: PROCESS_TIMEOUT_MS
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error.message) : null,
    signal: result.signal
  };
}

function runReference(name) {
  const { graph, params } = fixtureFiles(name);
  return run(process.execPath, [TS_REFERENCE, graph, ...(params ? [params] : [])]);
}

function runRunner(opts, name) {
  const { graph, params } = fixtureFiles(name);
  const args = ["run", "--bundle", resolve(opts.bundle), "--graph", graph];
  if (params) args.push("--params", params);
  return run(resolve(opts.runner), args);
}

/** Problems that make a process result unusable, before any comparison. */
function processProblems(label, result, parsed) {
  const problems = [];
  if (result.error) problems.push(`${label} failed to run: ${result.error}`);
  if (result.signal) problems.push(`${label} was killed by ${result.signal}`);
  problems.push(...parsed.problems.map((p) => `${label} stdout ${p}`));
  if (parsed.messages.length === 0) {
    problems.push(`${label} printed no messages${result.stderr ? `; stderr: ${result.stderr.trim().split("\n").slice(-3).join(" | ")}` : ""}`);
  }
  return problems;
}

function tail(text) {
  return text.trim().split("\n").slice(-5).join("\n    ");
}

// ---------------------------------------------------------------- modes

function checkFixture(opts, name) {
  const ref = runReference(name);
  const refParsed = parseStream(ref.stdout);
  const problems = processProblems("ts-reference", ref, refParsed);
  if (problems.length > 0) return problems;

  const refStatus = finalStatus(refParsed.messages);
  const expectedExit = EXIT_FOR_STATUS[refStatus];
  if (expectedExit === undefined) return [`ts-reference ended without a terminal job_update (last status: ${refStatus})`];

  const out = runRunner(opts, name);
  const outParsed = parseStream(out.stdout);
  const runnerProblems = processProblems("runner", out, outParsed);
  if (out.status === 2) runnerProblems.push(`runner exited 2 (usage error); stderr:\n    ${tail(out.stderr)}`);
  if (out.status !== expectedExit) {
    runnerProblems.push(`exit status: expected ${expectedExit} (${refStatus}), got ${out.status}${out.stderr ? `; stderr:\n    ${tail(out.stderr)}` : ""}`);
  }
  if (outParsed.messages.length === 0) return runnerProblems;

  return [
    ...runnerProblems,
    ...diffStreams(toStreams(refParsed.messages), toStreams(outParsed.messages))
  ];
}

function checkReferenceOnly(name) {
  const runs = [];
  for (let i = 0; i < REFERENCE_RUNS; i++) {
    const result = runReference(name);
    const parsed = parseStream(result.stdout);
    const problems = processProblems(`ts-reference run ${i + 1}`, result, parsed);
    if (problems.length > 0) return problems;
    if (EXIT_FOR_STATUS[finalStatus(parsed.messages)] === undefined) {
      return [`run ${i + 1} ended without a terminal job_update`];
    }
    runs.push(toStreams(parsed.messages));
  }
  const problems = [];
  for (let i = 1; i < runs.length; i++) {
    for (const d of diffStreams(runs[0], runs[i])) problems.push(`run 1 vs run ${i + 1}: ${d}`);
  }
  return problems;
}

function report(name, problems, extra = "") {
  if (problems.length === 0) {
    console.log(`PASS ${name}${extra}`);
    return true;
  }
  console.log(`FAIL ${name}`);
  for (const p of problems) console.log(p.split("\n").map((l) => `  ${l}`).join("\n"));
  return false;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.compare) {
    const [a, b] = opts.compare.map((f) => parseStream(readFileSync(f, "utf8")));
    const problems = [
      ...a.problems.map((p) => `${opts.compare[0]} ${p}`),
      ...b.problems.map((p) => `${opts.compare[1]} ${p}`)
    ];
    if (a.messages.length === 0 || b.messages.length === 0) problems.push("a stream is empty");
    problems.push(...diffStreams(toStreams(a.messages), toStreams(b.messages)));
    process.exit(report(`${opts.compare[0]} vs ${opts.compare[1]}`, problems) ? 0 : 1);
  }

  if (!opts.referenceOnly) {
    if (!opts.runner) usage("--runner is required");
    if (!opts.bundle) usage("--bundle is required");
  }
  const all = listFixtures();
  const names = opts.fixtures.length > 0 ? opts.fixtures : all;
  if (names.length === 0) usage(`no fixtures found in ${GRAPHS_DIR}`);
  for (const name of names) if (!all.includes(name)) usage(`unknown fixture "${name}" (have: ${all.join(", ")})`);

  let failed = 0;
  for (const name of names) {
    const ok = opts.referenceOnly
      ? report(name, checkReferenceOnly(name), ` (${REFERENCE_RUNS} identical runs)`)
      : report(name, checkFixture(opts, name));
    if (!ok) failed++;
  }
  console.log(`\n${names.length - failed}/${names.length} fixtures passed`);
  process.exit(failed === 0 ? 0 : 1);
}

// Run the CLI only when executed directly, so parity/run.mjs can import the
// comparison functions.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
