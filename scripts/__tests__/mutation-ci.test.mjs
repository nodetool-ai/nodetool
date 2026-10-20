import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { belongsToShard } from "../../packages/mutator/dist/shards.js";
import { aggregate, createPlan, executePartition, createPartitions, mutantWorkers, TARGETS } from "../mutation-ci.mjs";

const helper = new URL("../mutation-ci.mjs", import.meta.url).pathname;
let resultDirectory;
let root;
let plan;
let outputs;
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const put = (path, value) => writeFileSync(path, `${JSON.stringify(value)}\n`);

function git(...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "mutation-ci-"));
  for (const target of TARGETS) {
    mkdirSync(join(root, target), { recursive: true });
    writeFileSync(join(root, target, ".keep"), "");
  }
  writeFileSync(join(root, ".gitignore"), "/.metrics/\n/target/\n");
  writeFileSync(join(root, "packages/agents/package.json"), JSON.stringify({ name: "agents", type: "module", scripts: { test: "node tests/run.mjs" } }));
  mkdirSync(join(root, "packages/agents/tests"));
  writeFileSync(join(root, "packages/agents/src/math.mjs"), "export const previous = true;\n");
  writeFileSync(join(root, "packages/agents/src/batch.mjs"), "export const previous = true;\n");
  writeFileSync(join(root, "packages/agents/tests/run.mjs"), "import { positive, double, triple } from '../src/math.mjs';\nimport * as batch from '../src/batch.mjs';\nif (!positive(5) || positive(-5) || double(3) !== 6 || triple(3) !== 9 || !Object.values(batch).every((fn) => fn())) process.exit(1);\n");
  writeFileSync(join(root, "packages/agents/src/kept logic.mjs"), "export function retained(n) { return n + 10; }\n");
  git("init", "-q");
  git("add", ".");
  git("-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  writeFileSync(join(root, "packages/agents/src/math.mjs"), "export function positive(n) { return n > 0; }\nexport function double(n) { return n * 2; }\nexport function triple(n) { return n * 3; }\n");
  writeFileSync(join(root, "packages/agents/src/batch.mjs"), Array.from({ length: 17 }, (_, index) => `export function ready${index}() { return true; }`).join("\n"));
  writeFileSync(join(root, "packages/agents/src/kept logic.mjs"), "// Documentation changed outside the retained function.\nexport function retained(n) { return n + 10; }\n");
  git("add", ".");
  git("-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "add functions");
  plan = createPlan(root, base);
  expect(plan.version).toBe(2);
  expect(plan.partitions.length).toBeGreaterThan(3);
  expect(plan.selectedIds).toHaveLength(21);
  const batch = plan.partitions.filter((partition) => partition.file.endsWith("batch.mjs"));
  expect(batch.length).toBeGreaterThan(1);
  expect(batch.every((partition) => partition.shard.count === batch.length)).toBe(true);
  const path = join(root, ".metrics/plan.json");
  mkdirSync(dirname(path), { recursive: true });
  put(path, plan);
  resultDirectory = join(root, ".metrics/results");
  outputs = plan.partitions.map(({ id }) => join(resultDirectory, `mutation-result-partition-${id}`));
  for (const [offset, output] of outputs.entries()) {
    execFileSync(process.execPath, [helper, "run", path, String(plan.partitions[offset].id), output], { cwd: root, encoding: "utf8" });
  }
});

function changeReceipt(index, mutate, check) {
  const path = join(outputs[index], "receipt.json");
  const before = readFileSync(path, "utf8");
  try {
    const receipt = JSON.parse(before);
    mutate(receipt);
    put(path, receipt);
    check();
  } finally {
    writeFileSync(path, before);
  }
}

describe("mutation CI exact union", () => {
  it("combines actual independent shard outcomes and honest partial scores", () => {
    const result = aggregate(root, plan, outputs);
    expect(result.score).toContain("86.36%** | **19 / 22**");
    expect(result.survivors).toHaveLength(2);
    const receipts = outputs.map((output) => json(join(output, "receipt.json")));
    for (const [index, output] of outputs.entries()) {
      const rawJournal = readFileSync(join(output, "completed.ndjson"), "utf8");
      const journal = rawJournal.split("\n").filter(Boolean).map((line) => JSON.parse(line));
      expect(journal).toEqual(receipts[index].completed);
      if (receipts[index].assignedIds.length === 0) {
        expect(rawJournal).toBe("");
      }
    }
    const assigned = receipts.flatMap((receipt) => receipt.assignedIds);
    expect(receipts.some((receipt) => receipt.assignedIds.length > 0)).toBe(true);
    expect(receipts.some((receipt) => receipt.assignedIds.length === 0)).toBe(true);
    expect(assigned).toHaveLength(21);
    expect(new Set(assigned).size).toBe(21);
    expect(assigned.sort()).toEqual([...plan.selectedIds].sort());
    expect(receipts.flatMap((receipt) => receipt.completed).map((item) => item.id).sort()).toEqual(assigned);
    expect(receipts.flatMap((receipt) => receipt.completed).filter((item) => item.outcome === "killed")).toHaveLength(19);
    expect(receipts.flatMap((receipt) => receipt.completed).filter((item) => item.outcome === "survived")).toHaveLength(2);
  });

  it("rejects missing, repeated, cancelled, and baseline-failed shards", () => {
    expect(() => aggregate(root, plan, outputs.slice(1))).toThrow(/Missing/);
    expect(() => aggregate(root, plan, [...outputs.slice(0, -1), outputs[0]])).toThrow(/duplicate|indices/);
    for (const mutate of [
      (receipt) => { receipt.complete = false; },
      (receipt) => { receipt.code = 2; },
      (receipt) => { receipt.plan.base = "0".repeat(40); },
      (receipt) => { receipt.partition.shard.count += 1; },
      (receipt) => { receipt.partition.shard.index = 0; },
      (receipt) => { receipt.partition.id = 99; },
      (receipt) => { receipt.partition.shard.index = 1.5; },
      (receipt) => { receipt.partition.shard.index = "1"; }
    ]) {
      changeReceipt(0, mutate, () => expect(() => aggregate(root, plan, outputs)).toThrow());
    }
  });

  it("rejects invalid partition requests before executing mutations", async () => {
    for (const id of [0, 99, 1.5, "1", NaN, Infinity, { index: 1, count: 8 }]) {
      await expect(executePartition(root, plan, id, join(root, ".metrics/invalid-partition"))).rejects.toThrow();
    }
  });

  it("requires exactly the planned result directories at the public CLI", () => {
    const path = join(root, ".metrics/plan.json");
    const result = execFileSync(process.execPath, [helper, "aggregate", path, resultDirectory], { cwd: root, encoding: "utf8" });
    expect(result).toContain("86.36%** | **19 / 22**");
    for (const args of [[path], [path, resultDirectory, outputs[0]]]) {
      const invalid = spawnSync(process.execPath, [helper, "aggregate", ...args], { cwd: root, encoding: "utf8" });
      expect(invalid.status).not.toBe(0);
      expect(invalid.stderr).toContain("Usage: mutation-ci.mjs aggregate");
    }
    const unknown = join(resultDirectory, "unknown-partition");
    renameSync(outputs[0], unknown);
    try {
      const invalid = spawnSync(process.execPath, [helper, "aggregate", path, resultDirectory], { cwd: root, encoding: "utf8" });
      expect(invalid.status).not.toBe(0);
      expect(invalid.stderr).toContain("unexpected partition result directories");
    } finally {
      renameSync(unknown, outputs[0]);
    }
  });

  it.each(["missing", "truncated", "duplicate", "changed outcome"])("rejects a %s completion journal", (damage) => {
    const output = outputs.find((directory) => json(join(directory, "receipt.json")).completed.length > 0);
    expect(output).toBeDefined();
    const path = join(output, "completed.ndjson");
    const before = readFileSync(path, "utf8");
    const entries = before.trim().split("\n");
    try {
      if (damage === "missing") {
        renameSync(path, `${path}.held`);
      } else if (damage === "truncated") {
        writeFileSync(path, entries.slice(1).join("\n") + "\n");
      } else if (damage === "duplicate") {
        writeFileSync(path, before + entries[0] + "\n");
      } else {
        const entry = JSON.parse(entries[0]);
        entry.outcome = entry.outcome === "killed" ? "survived" : "killed";
        writeFileSync(path, [JSON.stringify(entry), ...entries.slice(1)].join("\n") + "\n");
      }
      expect(() => aggregate(root, plan, outputs)).toThrow(/journal|ENOENT/);
    } finally {
      if (damage === "missing") {
        renameSync(`${path}.held`, path);
      } else {
        writeFileSync(path, before);
      }
    }
    expect(aggregate(root, plan, outputs).score).toContain("86.36%** | **19 / 22**");
  });

  it("rejects omitted, duplicate, unexpected, and fabricated terminal outcomes", () => {
    const index = outputs.findIndex((output) => json(join(output, "receipt.json")).completed.length > 0);
    for (const mutate of [
      (receipt) => { receipt.completed.pop(); },
      (receipt) => { receipt.completed.push(receipt.completed[0]); },
      (receipt) => { receipt.completed[0].id = "unexpected"; },
      (receipt) => { receipt.completed[0].outcome = "uncovered"; },
      (receipt) => { receipt.assignedIds = []; }
    ]) {
      changeReceipt(index, mutate, () => expect(() => aggregate(root, plan, outputs)).toThrow());
    }
  });

  it("recomputes the frozen Git selection and rejects jointly trimmed plans and receipts", () => {
    const reduced = structuredClone(plan);
    reduced.selectedIds = [];
    reduced.files = [];
    const paths = outputs.map((output) => join(output, "receipt.json"));
    const receiptsBefore = paths.map((path) => readFileSync(path, "utf8"));
    try {
      for (const [index, path] of paths.entries()) {
        const receipt = JSON.parse(receiptsBefore[index]);
        receipt.plan = reduced;
        receipt.assignedIds = [];
        receipt.completed = [];
        put(path, receipt);
      }
      expect(() => aggregate(root, reduced, outputs)).toThrow(/Frozen/);
    } finally {
      for (const [index, path] of paths.entries()) {
        writeFileSync(path, receiptsBefore[index]);
      }
    }
    const source = join(root, plan.files[0].file);
    const before = readFileSync(source, "utf8");
    try {
      writeFileSync(source, `${before}\n`);
      expect(() => aggregate(root, plan, outputs)).toThrow(/clean/);
    } finally {
      writeFileSync(source, before);
    }
  });

  it("rejects source pins, commands, files, and partition tampering", async () => {
    for (const alter of [
      (value) => { value.head = "0".repeat(40); },
      (value) => { value.tree = "0".repeat(40); },
      (value) => { value.files[0].sourceHash = "0".repeat(64); },
      (value) => { value.files[0].command += " --bail=1"; },
      (value) => { value.files.pop(); },
      (value) => { value.files.push(value.files[0]); },
      (value) => { value.partitions.pop(); },
      (value) => { value.partitions.push(value.partitions[0]); },
      (value) => { value.partitions[0].file = "packages/agents/src/unknown.mjs"; }
    ]) {
      const invalid = structuredClone(plan);
      alter(invalid);
      expect(() => aggregate(root, invalid, outputs)).toThrow(/Frozen/);
      await expect(executePartition(root, invalid, 1, join(root, ".metrics/rejected-plan"))).rejects.toThrow(/Frozen/);
    }
  });

  it("runs and aggregates a validated no-op when the complete selection is empty", async () => {
    const empty = createPlan(root, plan.head);
    expect(empty.files).toEqual([]);
    expect(empty.selectedIds).toEqual([]);
    expect(empty.partitions).toEqual([{ id: 1, file: null, shard: null, assignedIds: [] }]);
    const output = join(root, ".metrics/empty-result");
    await executePartition(root, empty, 1, output);
    expect(json(join(output, "receipt.json"))).toMatchObject({ code: 0, complete: true, completed: [] });
    const result = aggregate(root, empty, [output]);
    expect(result.snapshots).toEqual([]);
    expect(result.survivors).toEqual([]);
  });

  it("exports exactly the descriptor IDs as a nonempty GitHub matrix, including no-op plans", () => {
    for (const [label, base] of [["normal", plan.base], ["empty", plan.head]]) {
      const output = join(root, `.metrics/${label}-github-output`);
      const file = join(root, `.metrics/${label}-cli-plan.json`);
      execFileSync(process.execPath, [helper, "plan", base, file], {
        cwd: root, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: output }
      });
      const values = Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }));
      expect(values.head).toBe(plan.head);
      expect(JSON.parse(values.matrix)).toEqual({ partition: json(file).partitions.map((item) => item.id) });
      expect(JSON.parse(values.matrix).partition.length).toBeGreaterThan(0);
    }
  });

  it("rejects altered partial snapshot outcomes and tallies", () => {
    const index = outputs.findIndex((output) => json(join(output, "receipt.json")).completed.length > 0);
    expect(index).toBeGreaterThanOrEqual(0);
    const receipt = json(join(outputs[index], "receipt.json"));
    const result = aggregate(root, plan, outputs);
    expect(result.snapshots.length).toBeGreaterThan(0);
    expect(result.snapshots.flatMap((item) => item.forms).some((form) => form.file === "packages/agents/src/kept logic.mjs" && form.sites === 1)).toBe(true);
    const snapshot = join(outputs[index], `metrics/${receipt.partition.file.replaceAll("/", ".").replace(/\.mjs$/, "")}.json`);
    const before = readFileSync(snapshot, "utf8");
    try {
      const data = JSON.parse(before);
      data.forms[0].survived += 1;
      put(snapshot, data);
      expect(() => aggregate(root, plan, outputs)).toThrow(/tallies/);
      put(snapshot, { ...JSON.parse(before), outcomes: { unexpected: "killed" } });
      expect(() => aggregate(root, plan, outputs)).toThrow(/outcomes/);
    } finally {
      writeFileSync(snapshot, before);
    }
    expect(receipt.complete).toBe(true);
  });
});

describe("bounded source partitions", () => {
  it("preserves all captured 926 canonical IDs and commands without repeating source files within jobs", () => {
    const captured = json(new URL("./fixtures/mutation-ci-consolidated-plan.json", import.meta.url));
    const before = structuredClone(captured);
    const partitions = createPartitions(captured.files);
    expect(partitions).toHaveLength(78);
    expect(captured.selectedIds).toHaveLength(926);
    expect(partitions.flatMap((item) => item.assignedIds).sort()).toEqual([...captured.selectedIds].sort());
    expect(new Set(partitions.flatMap((item) => item.assignedIds)).size).toBe(926);
    for (const file of captured.files) {
      const owned = partitions.filter((item) => item.file === file.file);
      expect(owned).toHaveLength(owned[0].shard.count);
      expect(owned.map((item) => item.shard.index)).toEqual(Array.from({ length: owned.length }, (_, index) => index + 1));
      for (const partition of owned) {
        expect(partition.assignedIds).toEqual(file.selectedIds.filter((id) => belongsToShard(id, partition.shard)));
        expect(partition.assignedIds.length).toBeLessThanOrEqual(file.file.startsWith("packages/agents/") ? 16 : 64);
      }
    }
    expect(captured).toEqual(before);
  });

  it("retains selected-empty hash buckets that can own unchanged form sites", () => {
    const ids = [];
    for (let index = 0; ids.length < 17; index++) {
      const id = `site-${index}`;
      if (belongsToShard(id, { index: 1, count: 2 }) && !belongsToShard(id, { index: 3, count: 3 })) {
        ids.push(id);
      }
    }
    const partitions = createPartitions([{ file: "packages/agents/src/path with spaces.ts", selectedIds: ids }]);
    expect(partitions).toHaveLength(3);
    expect(partitions[2].assignedIds).toEqual([]);
    const foundButUnchanged = Array.from({ length: 30 }, (_, index) => `unchanged-${index}`)
      .find((id) => belongsToShard(id, partitions[2].shard));
    expect(foundButUnchanged).toBeDefined();
    expect(partitions.filter((item) => belongsToShard(foundButUnchanged, item.shard))).toHaveLength(1);
  });

  it("preserves zero-selected files and rejects oversized or duplicate manifests", () => {
    expect(createPartitions([{ file: "packages/agents/src/empty.ts", selectedIds: [] }]))
      .toEqual([{ id: 1, file: "packages/agents/src/empty.ts", shard: { index: 1, count: 1 }, assignedIds: [] }]);
    const files = Array.from({ length: 257 }, (_, index) => ({ file: `packages/agents/src/file${index}.ts`, selectedIds: [] }));
    expect(() => createPartitions(files)).toThrow(/256-job/);
    expect(() => createPartitions([{ file: "packages/runtime/src/large.ts", selectedIds: Array.from({ length: 20000 }, (_, index) => `site-${index}`) }]))
      .toThrow(/256-job/);
    expect(() => createPartitions([files[0], files[0]])).toThrow(/duplicate/);
    expect(() => createPartitions([{ ...files[0], selectedIds: ["same", "same"] }])).toThrow(/duplicate/);
  });
});

it("pins every CI checkout and preserves complete target, budget, and aggregate contracts", () => {
  const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/mutation-changed.yml", import.meta.url), "utf8"));
  expect(workflow.permissions).toEqual({ contents: "read" });
  const jobs = workflow.jobs;
  expect(jobs["mutate-changed"].strategy).toEqual({ "fail-fast": false, "max-parallel": 32, matrix: "${{ fromJSON(needs.plan.outputs.matrix) }}" });
  expect(jobs.plan.outputs.matrix).toBe("${{ steps.plan.outputs.matrix }}");
  expect(jobs["mutate-changed"].steps.find((step) => step.name === "Mutate every assigned changed-function site").run)
    .toBe('node scripts/mutation-ci.mjs run .metrics/mutation-ci/plan.json "$PARTITION" ".metrics/mutation-ci/partition-$PARTITION"');
  const aggregateCommand = jobs["mutation-complete"].steps.find((step) => step.name === "Verify the exact union and report survivors").run;
  expect(aggregateCommand.trim().split(/\s+/)).toEqual([
    "node", "scripts/mutation-ci.mjs", "aggregate", ".metrics/mutation-ci/plan.json",
    ".metrics/mutation-ci/results"
  ]);
  for (const job of Object.values(jobs)) {
    expect(job["timeout-minutes"]).toBe(job === jobs["mutate-changed"] ? 180 : 45);
    const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
    expect(checkout.with["fetch-depth"]).toBe(0);
    expect(checkout.with.filter).toBe("blob:none");
    if (job !== jobs.plan) {
      expect(checkout.with.ref).toBe("${{ needs.plan.outputs.head }}");
    }
    for (const artifact of job.steps.filter((step) => step.uses?.startsWith("actions/upload-artifact@"))) {
      expect(artifact.with["include-hidden-files"]).toBe(true);
      expect(artifact.with["if-no-files-found"]).toBe("error");
    }
  }
  expect(jobs.plan.steps.find((step) => step.id === "plan").env.BASE).toBe("${{ github.event.pull_request.base.sha }}");
  expect(jobs["mutation-complete"].if).toBe("always()");
  expect(jobs["mutation-complete"].needs).toEqual(["plan", "mutate-changed"]);
  const guard = jobs["mutation-complete"].steps[0];
  expect(guard.env).toEqual({ PLAN: "${{ needs.plan.result }}", MUTATIONS: "${{ needs.mutate-changed.result }}" });
  for (const plan of ["success", "failure", "cancelled", "skipped"]) {
    for (const mutations of ["success", "failure", "cancelled", "skipped"]) {
      const result = spawnSync("bash", ["-c", guard.run], { env: { ...process.env, PLAN: plan, MUTATIONS: mutations } });
      expect(result.status === 0).toBe(plan === "success" && mutations === "success");
    }
  }
  expect(TARGETS).toEqual(["agents", "auth", "config", "kernel", "mutator", "node-sdk", "runtime", "security", "storage"].map((name) => `packages/${name}/src`));
  for (const path of ["scripts/mutation-ci.mjs", "scripts/mutation-score.mjs", "scripts/__tests__/mutation-ci.test.mjs", "packages/mutator/tests/**"]) {
    expect(workflow.on.pull_request.paths).toContain(path);
  }
});


it("prepares sandboxed Chromium before mutation baselines execute browser tests", () => {
  const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/mutation-changed.yml", import.meta.url), "utf8"));
  const steps = workflow.jobs["mutate-changed"].steps;
  const mutation = steps.findIndex(step => step.name === "Mutate every assigned changed-function site");
  const install = steps.findIndex(step => step.run === "npx playwright install --with-deps chromium");
  const sandbox = steps.findIndex(step => step.name === "Enable and verify the Chromium sandbox");
  expect(install).toBeGreaterThanOrEqual(0);
  expect(sandbox).toBeGreaterThan(install);
  expect(mutation).toBeGreaterThan(sandbox);
  expect(steps[install].if).toBeUndefined();
  expect(steps[sandbox].if).toBeUndefined();
  expect(steps[sandbox].run).toContain("sudo apparmor_parser -r");
  expect(steps[sandbox].run).toContain("chromiumSandbox: true");
  expect(steps[sandbox].run).toContain("await browser.close()");
  expect(steps[sandbox].run).not.toContain("--no-sandbox");
});


it("downloads one partition into its canonical result directory without flattening it", () => {
  const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/mutation-changed.yml", import.meta.url), "utf8"));
  const steps = workflow.jobs["mutation-complete"].steps;
  const single = steps.find((step) => step.name === "Download one partition result");
  const multiple = steps.find((step) => step.name === "Download partition results");
  expect(single).toBeDefined();
  expect(single.if).toBe("${{ !fromJSON(needs.plan.outputs.matrix).partition[1] }}");
  expect(single.with).toEqual({
    name: "mutation-result-partition-${{ fromJSON(needs.plan.outputs.matrix).partition[0] }}",
    path: ".metrics/mutation-ci/results/mutation-result-partition-${{ fromJSON(needs.plan.outputs.matrix).partition[0] }}"
  });
  expect(multiple).toBeDefined();
  expect(multiple.if).toBe("${{ fromJSON(needs.plan.outputs.matrix).partition[1] }}");
  expect(multiple.uses).toBe(single.uses);
  expect(multiple.with).toEqual({
    pattern: "mutation-result-partition-*", path: ".metrics/mutation-ci/results"
  });
  expect(steps.indexOf(single)).toBeLessThan(steps.findIndex((step) => step.name === "Verify the exact union and report survivors"));
  expect(steps.indexOf(multiple)).toBeLessThan(steps.findIndex((step) => step.name === "Verify the exact union and report survivors"));
});

it("runs as many agents mutants at once as the runner's memory holds", () => {
  const gib = 1024 ** 3;
  expect(mutantWorkers("packages/agents/src/js-sandbox-worker/interpreter.ts", 16 * gib)).toBe(2);
  expect(mutantWorkers("packages/agents/src/tools/x.ts", 4 * gib)).toBe(1);
  expect(mutantWorkers("packages/kernel/src/graph.ts", 16 * gib)).toBeNull();
});
