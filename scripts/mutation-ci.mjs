import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { totalmem } from "node:os";
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
const MAX_PARTITIONS = 256;
// One `vitest related` run over an agents file peaks near 6.5 GB. Four of
// them in parallel exhausted a 16 GB runner, which then shut down. Half
// the workers take twice as long, so mutate-changed allows 180 minutes.
const AGENT_SUITE_BYTES = 7 * 1024 ** 3;
export function mutantWorkers(file, memory = totalmem()) {
  return file.startsWith("packages/agents/") ? Math.max(1, Math.floor(memory / AGENT_SUITE_BYTES)) : null;
}
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
/** One canonical file per job avoids repeating broad baselines for later files. */
export function createPartitions(files) {
  unique(files.map((file) => file.file), "canonical files");
  unique(files.flatMap((file) => file.selectedIds), "canonical selection");
  const partitions = [];
  for (const file of files) {
    // CI completed bridge buckets of up to 19 sites, but a second broad baseline
    // exceeded the job budget. Leave margin with 16 agent sites per baseline;
    // the other current targets have much smaller related-test sets.
    const limit = file.file.startsWith("packages/agents/") ? 16 : 64;
    let count = Math.max(1, Math.ceil(file.selectedIds.length / limit));
    let buckets;
    for (;;) {
      assert(partitions.length + count <= MAX_PARTITIONS, "Mutation plan exceeds the 256-job matrix limit");
      buckets = Array.from({ length: count }, (_, offset) => {
        const shard = { index: offset + 1, count };
        return { file: file.file, shard, assignedIds: shardIds(file.selectedIds, shard) };
      });
      if (buckets.every((bucket) => bucket.assignedIds.length <= limit)) {
        break;
      }
      count += 1;
    }
    for (const bucket of buckets) {
      // Empty selected buckets still own unchanged/uncovered form sites.
      partitions.push({ id: partitions.length + 1, ...bucket });
    }
  }
  return partitions.length > 0 ? partitions : [{ id: 1, file: null, shard: null, assignedIds: [] }];
}

function partitionOf(plan, id) {
  assert(Number.isSafeInteger(id) && id >= 1, "Invalid partition ID");
  const partition = plan.partitions.find((item) => item.id === id);
  assert(partition, "Unknown partition ID");
  return partition;
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
  return { version: 2, head, tree: git(root, "rev-parse", "HEAD^{tree}"), base: baseCommit, mergeBase, argv, files, selectedIds, partitions: createPartitions(files) };
}

function verifyPlan(root, plan) {
  assert.equal(plan.version, 2);
  assert.match(plan.base, /^[a-f0-9]{40}$/);
  assert.deepEqual(plan.argv, ["--base", plan.base, "--no-coverage", ...TARGETS]);
  assert.deepEqual(createPlan(root, plan.base), plan, "Frozen source/base selection differs from the plan");
}

export async function executePartition(root, plan, id, output) {
  verifyPlan(root, plan);
  const partition = partitionOf(plan, id);
  assert(!existsSync(output), "Refusing preexisting partition metrics or receipts");
  mkdirSync(output, { recursive: true });
  const journal = join(output, "completed.ndjson");
  writeFileSync(journal, "");
  const metrics = join(output, "metrics");
  mkdirSync(metrics);
  const { assignedIds } = partition;
  const observed = [];
  const completed = [];
  let code = null;
  let complete = false;
  try {
    const file = partition.file === null ? null : plan.files.find((item) => item.file === partition.file);
    const workers = file === null ? null : mutantWorkers(file.file);
    code = file === null ? 0 : await run([
      "--root", root, "--base", plan.base, "--no-coverage", file.file,
      "--shard", `${partition.shard.index}/${partition.shard.count}`, "--metrics-dir", metrics,
      ...(workers === null ? [] : ["--max-workers", String(workers)])
    ], undefined, undefined, {
      selection: (selectedFile, ids) => {
        assert.equal(selectedFile, file.file, "Runtime selected an unexpected source file");
        observed.push(...ids);
      },
      completed: (mutationId, outcome) => {
        completed.push({ id: mutationId, outcome });
        appendFileSync(journal, `${JSON.stringify({ id: mutationId, outcome })}\n`);
        console.log(`Partition ${id}/${plan.partitions.length} completed ${completed.length}/${assignedIds.length}`);
      }
    });
    assert([0, 3].includes(code), `Partition did not complete: mutator exit ${code}`);
    assert.deepEqual(observed, file?.selectedIds ?? [], "Runtime canonical file selection drifted");
    assert.deepEqual(unique(completed.map((item) => item.id), "completed"), unique(assignedIds, "assigned"));
    verifyPlan(root, plan);
    complete = true;
  } finally {
    writeJson(join(output, "receipt.json"), { version: 2, plan, partition, assignedIds, completed, code, complete });
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
  assert.equal(outputs.length, plan.partitions.length, "Missing or extra partition result directories");
  const indices = [];
  const allAssigned = [];
  const allCompleted = [];
  const snapshots = [];
  for (const output of outputs) {
    const receipt = readJson(join(output, "receipt.json"));
    assert.equal(receipt.version, 2);
    assert.equal(receipt.complete, true, "Partition is incomplete");
    assert([0, 3].includes(receipt.code), "Partition baseline or execution failed");
    assert.deepEqual(receipt.plan, plan, "Partition plan/pins do not match");
    const partition = partitionOf(plan, receipt.partition.id);
    assert.deepEqual(receipt.partition, partition, "Partition descriptor differs from the frozen plan");
    indices.push(partition.id);
    const expectedIds = partition.assignedIds;
    assert.deepEqual(receipt.assignedIds, expectedIds, "Assignment differs from canonical partition");
    const journal = readFileSync(join(output, "completed.ndjson"), "utf8")
      .split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.deepEqual(journal, receipt.completed, "Partition completion journal differs from its receipt");
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
    for (const file of plan.files.filter((item) => item.file === partition.file)) {
      const path = join(root, file.file);
      const source = readFileSync(path, "utf8");
      const { found, covered } = selectFileSites(path, source, context);
      const owned = found.filter((site) => belongsToShard(site.mutationId, partition.shard));
      for (const form of tallyForms(source, path, file.file, owned, covered, new Map(outcomes), null)) {
        expectedForms.push([form.namespace, renderedForm(form)]);
      }
    }
    const actualForms = partial.flatMap((snapshot) => snapshot.forms.map((form) => [snapshot.namespace, form]));
    const sorted = (values) => values.map((item) => JSON.stringify(item)).sort();
    assert.deepEqual(sorted(actualForms), sorted(expectedForms), "Partition snapshot tallies differ from actual terminal outcomes");
    snapshots.push(...partial);
  }
  assert.deepEqual(indices.sort((a, b) => a - b), plan.partitions.map((item) => item.id), "Missing or duplicate partition indices");
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
      const matrix = { partition: plan.partitions.map((item) => item.id) };
      writeFileSync(process.env.GITHUB_OUTPUT, `head=${plan.head}\nmatrix=${JSON.stringify(matrix)}\n`, { flag: "a" });
    }
    console.log(`Planned ${plan.selectedIds.length} mutants at ${plan.head}, base ${plan.base}`);
  } else if (command === "run") {
    assert.equal(rest.length, 3, "Usage: mutation-ci.mjs run PLAN PARTITION_ID NEW_OUTPUT");
    assert.match(rest[1], /^[1-9]\d*$/, "Invalid partition ID");
    await executePartition(root, readJson(rest[0]), Number(rest[1]), resolve(rest[2]));
  } else if (command === "aggregate") {
    assert.equal(rest.length, 2, "Usage: mutation-ci.mjs aggregate PLAN RESULTS_DIRECTORY");
    const plan = readJson(rest[0]);
    verifyPlan(root, plan);
    const entries = readdirSync(rest[1], { withFileTypes: true });
    assert(entries.every((entry) => entry.isDirectory()), "Unexpected partition result file");
    const names = plan.partitions.map((item) => `mutation-result-partition-${item.id}`);
    assert.deepEqual(entries.map((entry) => entry.name).sort(), [...names].sort(), "Missing or unexpected partition result directories");
    const result = aggregate(root, plan, names.map((name) => join(rest[1], name)));
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
