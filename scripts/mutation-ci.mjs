import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, run, selectFiles } from "../packages/mutator/dist/cli.js";
import { selectFileSites, tallyForms } from "../packages/mutator/dist/engine.js";
import { formsChangedSince } from "../packages/mutator/dist/git.js";
import { defaultTestCommand, expandCommand, packageDirOf, relativeKey } from "../packages/mutator/dist/project.js";
import { belongsToShard } from "../packages/mutator/dist/shards.js";
import { SnapshotStore } from "../packages/mutator/dist/snapshot.js";
import { loadSnapshots, scoreTable, survivors } from "./mutation-score.mjs";

export const TARGETS = ["agents", "auth", "config", "kernel", "mutator", "node-sdk", "runtime", "security", "storage"]
  .map((name) => `packages/${name}/src`);
const COUNT = 8;
const SHARD_INDICES = Array.from({ length: COUNT }, (_, index) => index + 1);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}
function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}
function unique(ids, label) {
  assert(Array.isArray(ids) && ids.every((id) => typeof id === "string"), `${label}: expected string IDs`);
  assert.equal(new Set(ids).size, ids.length, `${label}: duplicate IDs`);
  return [...ids].sort();
}
function shardIds(ids, shard) {
  return ids.filter((id) => belongsToShard(id, shard));
}
function verifyShard(shard) {
  assert.equal(shard.count, COUNT);
  assert(Number.isSafeInteger(shard.index) && shard.index >= 1 && shard.index <= COUNT, "Invalid shard index");
}
/** Give sources dedicated jobs when possible, then hash sites within each source. */
export function sourceWorkloads(files) {
  const jobs = SHARD_INDICES.map((index) => ({ index, sources: [] }));
  const ordered = [...files].sort((a, b) => a.file.localeCompare(b.file));
  if (ordered.length > COUNT) {
    const loads = jobs.map(() => 0);
    for (const file of [...ordered].sort((a, b) => b.selectedIds.length - a.selectedIds.length || a.file.localeCompare(b.file))) {
      const index = loads.indexOf(Math.min(...loads));
      jobs[index].sources.push({ file: file.file, shard: { index: 1, count: 1 } });
      loads[index] += Math.max(1, file.selectedIds.length);
    }
  } else {
    const counts = ordered.map(() => 1);
    for (let allocated = ordered.length; allocated < COUNT; allocated++) {
      let best = -1;
      for (let index = 0; index < ordered.length; index++) {
        if (counts[index] >= Math.max(1, ordered[index].selectedIds.length)) { continue; }
        if (best < 0 || ordered[index].selectedIds.length * (counts[best] + 1) >
          ordered[best].selectedIds.length * (counts[index] + 1)) { best = index; }
      }
      if (best < 0) { break; }
      counts[best]++;
    }
    let job = 0;
    for (const [offset, file] of ordered.entries()) {
      for (let index = 1; index <= counts[offset]; index++) {
        jobs[job++].sources.push({ file: file.file, shard: { index, count: counts[offset] } });
      }
    }
  }
  for (const job of jobs) { job.sources.sort((a, b) => a.file.localeCompare(b.file)); }
  return jobs;
}

function invocationsFor(plan, shard) {
  const groups = new Map();
  const files = new Map(plan.files.map((file) => [file.file, file]));
  for (const source of plan.workloads[shard.index - 1].sources) {
    const key = `${source.shard.index}/${source.shard.count}`;
    const group = groups.get(key) ?? { shard: source.shard, files: [] };
    group.files.push(source.file);
    groups.set(key, group);
  }
  const units = [...groups.values()];
  return units.map((unit, index) => ({ ...unit,
    metrics: units.length === 1 ? "metrics" : `invocations/${index + 1}/metrics`,
    assignedIds: unit.files.flatMap((name) => shardIds(files.get(name).selectedIds, unit.shard))
  }));
}

function selectionContext(root, base) {
  const empty = join(root, ".metrics", "mutation-ci-empty-history");
  assert(!existsSync(empty), "CI mutation selection requires an absent history directory");
  return {
    root, store: new SnapshotStore(root, empty), coveredLines: null, mutateAll: false, lines: null,
    changedForms: (path, source) => formsChangedSince(root, base, path, relativeKey(root, path), source)
  };
}

/** Freeze the actual canonical selection, not an independently approximated list. */
export function createPlan(root, base) {
  assert.equal(git(root, "status", "--porcelain", "--untracked-files=all"), "", "Mutation source checkout must be clean");
  const head = git(root, "rev-parse", "HEAD");
  const baseCommit = git(root, "rev-parse", "--verify", `${base}^{commit}`);
  const mergeBase = git(root, "merge-base", head, baseCommit);
  const argv = ["--base", baseCommit, "--no-coverage", ...TARGETS];
  const options = parseArgs(argv, root);
  assert.notEqual(options, "help");
  const context = selectionContext(root, mergeBase);
  const files = selectFiles(options, root).map((path) => {
    const file = relativeKey(root, path);
    const source = readFileSync(path, "utf8");
    const priorSourceHash = git(root, "ls-tree", "--name-only", mergeBase, "--", file) === ""
      ? null : hash(execFileSync("git", ["-C", root, "show", `${mergeBase}:${file}`], { maxBuffer: 64 * 1024 * 1024 }));
    const selected = selectFileSites(path, source, context);
    const packageDir = packageDirOf(path, root);
    return {
      file, sourceHash: hash(source), priorSourceHash,
      command: expandCommand(defaultTestCommand(packageDir), path, packageDir),
      selectedIds: selected.selected.map((site) => site.mutationId)
    };
  });
  const selectedIds = files.flatMap((file) => file.selectedIds);
  unique(selectedIds, "canonical selection");
  return { version: 2, workloads: sourceWorkloads(files), head, tree: git(root, "rev-parse", "HEAD^{tree}"), base: baseCommit, mergeBase, shardCount: COUNT, argv, files, selectedIds };
}

function verifyPlan(root, plan) {
  assert.equal(plan.version, 2);
  assert.equal(plan.shardCount, COUNT);
  assert.match(plan.base, /^[a-f0-9]{40}$/);
  assert.deepEqual(plan.argv, ["--base", plan.base, "--no-coverage", ...TARGETS]);
  assert.deepEqual(createPlan(root, plan.base), plan, "Frozen source/base selection differs from the plan");
}

export async function executeShard(root, plan, shard, output) {
  verifyPlan(root, plan);
  verifyShard(shard);
  assert(!existsSync(output), "Refusing preexisting shard metrics or receipts");
  mkdirSync(output, { recursive: true });
  const journal = join(output, "completed.ndjson");
  writeFileSync(journal, "");
  const units = invocationsFor(plan, shard);
  const files = new Map(plan.files.map((file) => [file.file, file]));
  const assignedIds = units.flatMap((unit) => unit.assignedIds);
  const completed = [];
  const invocations = [];
  let code = null;
  let complete = false;
  try {
    code = 0;
    for (const [offset, unit] of units.entries()) {
      const observed = [];
      const terminal = [];
      const unitDirectory = join(output, "invocations", String(offset + 1));
      mkdirSync(unitDirectory, { recursive: true });
      const unitJournal = join(unitDirectory, "completed.ndjson");
      writeFileSync(unitJournal, "");
      const receipt = { ...unit, completed: terminal, code: null, complete: false };
      invocations.push(receipt);
      const priorCode = code;
      code = null;
      try {
        receipt.code = await run([
          "--root", root, "--base", plan.base, "--no-coverage", ...unit.files,
          "--shard", `${unit.shard.index}/${unit.shard.count}`, "--metrics-dir", join(output, unit.metrics)
        ], undefined, undefined, {
          selection: (file, ids) => observed.push({ file, ids }),
          completed: (id, outcome) => {
            const entry = { id, outcome };
            terminal.push(entry);
            completed.push(entry);
            appendFileSync(unitJournal, `${JSON.stringify(entry)}\n`);
            appendFileSync(journal, `${JSON.stringify(entry)}\n`);
            console.log(`Shard ${shard.index}/${shard.count} completed ${completed.length}/${assignedIds.length}`);
          }
        });
        code = receipt.code === 0 ? priorCode : receipt.code;
        assert([0, 3].includes(receipt.code), `Shard did not complete: mutator exit ${receipt.code}`);
        assert.deepEqual(observed, unit.files.map((name) => ({ file: name,
          ids: files.get(name).selectedIds })), "Runtime canonical selection drifted");
        assert.deepEqual(unique(terminal.map((item) => item.id), "completed"), unique(unit.assignedIds, "assigned"));
        receipt.complete = true;
      } finally {
        writeJson(join(unitDirectory, "receipt.json"), receipt);
      }
    }
    assert.deepEqual(unique(completed.map((item) => item.id), "completed"), unique(assignedIds, "assigned"));
    verifyPlan(root, plan);
    complete = true;
  } finally {
    writeJson(join(output, "receipt.json"), { version: 1, plan, shard, assignedIds, completed, invocations, code, complete });
  }
}

function renderedForm(form) {
  return {
    id: form.id, kind: form.private ? "defn-" : "defn", file: form.file, line: form.line,
    "end-line": form.endLine, hash: form.digest, killed: form.killed, survived: form.survived,
    uncovered: form.uncovered, sites: form.sites
  };
}

/** Validate every execution before rendering any global score. */
export function aggregate(root, plan, outputs) {
  verifyPlan(root, plan);
  assert.equal(outputs.length, COUNT, "Missing or extra shard result directories");
  const indices = [];
  const allAssigned = [];
  const allCompleted = [];
  const snapshots = [];
  for (const output of outputs) {
    const receipt = readJson(join(output, "receipt.json"));
    assert.equal(receipt.version, 1);
    assert.equal(receipt.complete, true, "Shard is incomplete");
    assert([0, 3].includes(receipt.code), "Shard baseline or execution failed");
    assert.deepEqual(receipt.plan, plan, "Shard plan/pins do not match");
    verifyShard(receipt.shard);
    indices.push(receipt.shard.index);
    const units = invocationsFor(plan, receipt.shard);
    const expectedIds = units.flatMap((unit) => unit.assignedIds);
    assert.deepEqual(receipt.assignedIds, expectedIds, "Shard assignment differs from canonical partition");
    const completedIds = unique(receipt.completed.map((item) => item.id), "completed");
    assert.deepEqual(completedIds, unique(expectedIds, "assigned"), "Missing or unexpected terminal outcomes");
    for (const { outcome } of receipt.completed) {
      assert(["killed", "survived"].includes(outcome), "Invalid terminal outcome");
    }
    allAssigned.push(...receipt.assignedIds);
    allCompleted.push(...completedIds);
    assert.deepEqual(readFileSync(join(output, "completed.ndjson"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)),
      receipt.completed, "Shard completion journal differs");
    assert.equal(receipt.invocations.length, units.length, "Missing or extra source invocations");
    for (const [offset, unit] of units.entries()) {
      const invocation = receipt.invocations[offset];
      const unitDirectory = join(output, "invocations", String(offset + 1));
      assert.deepEqual(readJson(join(unitDirectory, "receipt.json")), invocation, "Invocation receipt differs");
      for (const key of ["files", "shard", "metrics", "assignedIds"]) {
        assert.deepEqual(invocation[key], unit[key], "Invocation differs from frozen source assignment");
      }
      assert.equal(invocation.complete, true, "Source invocation is incomplete");
      assert([0, 3].includes(invocation.code), "Source baseline or execution failed");
      const ids = unique(invocation.completed.map(({ id }) => id), "invocation completions");
      assert.deepEqual(ids, unique(unit.assignedIds, "invocation assignment"));
      assert.deepEqual(readFileSync(join(unitDirectory, "completed.ndjson"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)),
        invocation.completed, "Invocation completion journal differs");
      const partial = loadSnapshots(join(output, unit.metrics));
      const outcomes = partial.flatMap((snapshot) => Object.entries(snapshot.outcomes));
      assert.deepEqual(unique(outcomes.map(([id]) => id), "snapshot outcomes"), ids, "Snapshot outcomes differ from actual completions");
      assert.deepEqual(Object.fromEntries(outcomes), Object.fromEntries(invocation.completed.map(({ id, outcome }) => [id, outcome])));
      const context = selectionContext(root, plan.mergeBase);
      const expectedForms = [];
      for (const name of unit.files) {
        const path = join(root, name);
        const source = readFileSync(path, "utf8");
        const { found, covered } = selectFileSites(path, source, context);
        const owned = found.filter((site) => belongsToShard(site.mutationId, unit.shard));
        for (const form of tallyForms(source, path, name, owned, covered, new Map(outcomes), null)) {
          expectedForms.push([form.namespace, renderedForm(form)]);
        }
      }
      const actualForms = partial.flatMap((snapshot) => snapshot.forms.map((form) => [snapshot.namespace, form]));
      const sorted = (values) => values.map((item) => JSON.stringify(item)).sort();
      assert.deepEqual(sorted(actualForms), sorted(expectedForms), "Shard snapshot tallies differ from actual terminal outcomes");
      snapshots.push(...partial);
    }
    assert.deepEqual(receipt.invocations.flatMap((unit) => unit.completed), receipt.completed, "Source completions differ from shard journal");

  }
  assert.deepEqual(indices.sort((a, b) => a - b), SHARD_INDICES, "Missing or duplicate shard indices");
  assert.deepEqual(unique(allAssigned, "all assignments"), unique(plan.selectedIds, "canonical selection"));
  assert.deepEqual(unique(allCompleted, "all completions"), unique(plan.selectedIds, "canonical selection"));
  return { snapshots, score: scoreTable(snapshots, []), survivors: survivors(snapshots, [], (file) => readFileSync(join(root, file), "utf8")) };
}

async function main(args) {
  const [command, ...rest] = args;
  const root = process.cwd();
  if (command === "plan") {
    assert.equal(rest.length, 2, "Usage: mutation-ci.mjs plan BASE OUTPUT");
    const plan = createPlan(root, rest[0]);
    writeJson(resolve(rest[1]), plan);
    if (process.env.GITHUB_OUTPUT) {
      writeFileSync(process.env.GITHUB_OUTPUT, `head=${plan.head}\n`, { flag: "a" });
    }
    console.log(`Planned ${plan.selectedIds.length} mutants at ${plan.head}, base ${plan.base}`);
  } else if (command === "run") {
    assert.equal(rest.length, 3, "Usage: mutation-ci.mjs run PLAN INDEX/COUNT NEW_OUTPUT");
    const options = parseArgs(["--shard", rest[1]]);
    assert.notEqual(options, "help");
    await executeShard(root, readJson(rest[0]), options.shard, resolve(rest[2]));
  } else if (command === "aggregate") {
    assert.equal(rest.length, COUNT + 1, `Usage: mutation-ci.mjs aggregate PLAN SHARD_1 ... SHARD_${COUNT}`);
    const result = aggregate(root, readJson(rest[0]), rest.slice(1));
    const shown = result.survivors.slice(0, 60);
    const remainder = result.survivors.length > shown.length ? `\n…and ${result.survivors.length - shown.length} more.\n` : "";
    const text = `${result.score}\n${result.survivors.length} mutants survived.\n\n${shown.map((item) => `- ${item.file}:${item.line} ${item.mutation}`).join("\n")}\n${remainder}`;
    process.stdout.write(text);
    if (process.env.GITHUB_STEP_SUMMARY) {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, text, { flag: "a" });
    }
    if (result.survivors.length > 0) {
      console.log("::warning::Mutants survived in changed functions. See the job summary.");
    }
  } else {
    throw new Error("Expected plan, run, or aggregate");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
