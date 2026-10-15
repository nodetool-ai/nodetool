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
const COUNT = 2;
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
  return { version: 1, head, tree: git(root, "rev-parse", "HEAD^{tree}"), base: baseCommit, mergeBase, shardCount: COUNT, argv, files, selectedIds };
}

function verifyPlan(root, plan) {
  assert.equal(plan.version, 1);
  assert.equal(plan.shardCount, COUNT);
  assert.match(plan.base, /^[a-f0-9]{40}$/);
  assert.deepEqual(plan.argv, ["--base", plan.base, "--no-coverage", ...TARGETS]);
  assert.deepEqual(createPlan(root, plan.base), plan, "Frozen source/base selection differs from the plan");
}

export async function executeShard(root, plan, shard, output) {
  verifyPlan(root, plan);
  assert.equal(shard.count, COUNT);
  assert([1, 2].includes(shard.index));
  assert(!existsSync(output), "Refusing preexisting shard metrics or receipts");
  mkdirSync(output, { recursive: true });
  const metrics = join(output, "metrics");
  const assignedIds = shardIds(plan.selectedIds, shard);
  const observed = [];
  const completed = [];
  let code = null;
  let complete = false;
  try {
    code = await run([
      "--root", root, ...plan.argv, "--shard", `${shard.index}/${shard.count}`, "--metrics-dir", metrics
    ], undefined, undefined, {
      selection: (_file, ids) => observed.push(...ids),
      completed: (id, outcome) => {
        completed.push({ id, outcome });
        appendFileSync(join(output, "completed.ndjson"), `${JSON.stringify({ id, outcome })}\n`);
        console.log(`Shard ${shard.index}/${shard.count} completed ${completed.length}/${assignedIds.length}`);
      }
    });
    assert([0, 3].includes(code), `Shard did not complete: mutator exit ${code}`);
    assert.deepEqual(observed, plan.selectedIds, "Runtime canonical selection drifted");
    assert.deepEqual(unique(completed.map((item) => item.id), "completed"), unique(assignedIds, "assigned"));
    verifyPlan(root, plan);
    complete = true;
  } finally {
    writeJson(join(output, "receipt.json"), { version: 1, plan, shard, assignedIds, completed, code, complete });
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
    assert.equal(receipt.shard.count, COUNT);
    assert([1, 2].includes(receipt.shard.index));
    indices.push(receipt.shard.index);
    const expectedIds = shardIds(plan.selectedIds, receipt.shard);
    assert.deepEqual(receipt.assignedIds, expectedIds, "Shard assignment differs from canonical partition");
    const completedIds = unique(receipt.completed.map((item) => item.id), "completed");
    assert.deepEqual(completedIds, unique(expectedIds, "assigned"), "Missing or unexpected terminal outcomes");
    for (const { outcome } of receipt.completed) {
      assert(["killed", "survived"].includes(outcome), "Invalid terminal outcome");
    }
    allAssigned.push(...receipt.assignedIds);
    allCompleted.push(...completedIds);
    const partial = loadSnapshots(join(output, "metrics"));
    const outcomes = partial.flatMap((snapshot) => Object.entries(snapshot.outcomes));
    assert.deepEqual(unique(outcomes.map(([id]) => id), "snapshot outcomes"), completedIds, "Snapshot outcomes differ from actual completions");
    assert.deepEqual(Object.fromEntries(outcomes), Object.fromEntries(receipt.completed.map(({ id, outcome }) => [id, outcome])));
    const context = selectionContext(root, plan.mergeBase);
    const expectedForms = [];
    for (const file of plan.files) {
      const path = join(root, file.file);
      const source = readFileSync(path, "utf8");
      const { found, covered } = selectFileSites(path, source, context);
      const owned = found.filter((site) => belongsToShard(site.mutationId, receipt.shard));
      for (const form of tallyForms(source, path, file.file, owned, covered, new Map(outcomes), null)) {
        expectedForms.push([form.namespace, renderedForm(form)]);
      }
    }
    const actualForms = partial.flatMap((snapshot) => snapshot.forms.map((form) => [snapshot.namespace, form]));
    const sorted = (values) => values.map((item) => JSON.stringify(item)).sort();
    assert.deepEqual(sorted(actualForms), sorted(expectedForms), "Shard snapshot tallies differ from actual terminal outcomes");
    snapshots.push(...partial);
  }
  assert.deepEqual(indices.sort(), [1, 2], "Missing or duplicate shard indices");
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
    assert.equal(rest.length, 3, "Usage: mutation-ci.mjs aggregate PLAN SHARD_1 SHARD_2");
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
