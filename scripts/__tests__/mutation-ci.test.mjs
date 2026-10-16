import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { aggregate, createPlan, executeShard, TARGETS } from "../mutation-ci.mjs";

const helper = new URL("../mutation-ci.mjs", import.meta.url).pathname;
const shardIndices = [1, 2, 3, 4, 5, 6, 7, 8];
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
  writeFileSync(join(root, "packages/agents/tests/run.mjs"), "import { positive, double, triple } from '../src/math.mjs';\nif (!positive(5) || positive(-5) || double(3) !== 6 || triple(3) !== 9) process.exit(1);\n");
  git("init", "-q");
  git("add", ".");
  git("-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  writeFileSync(join(root, "packages/agents/src/math.mjs"), "export function positive(n) { return n > 0; }\nexport function double(n) { return n * 2; }\nexport function triple(n) { return n * 3; }\n");
  git("add", ".");
  git("-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "add functions");
  plan = createPlan(root, base);
  expect(plan.shardCount).toBe(8);
  expect(plan.selectedIds).toHaveLength(4);
  const path = join(root, ".metrics/plan.json");
  mkdirSync(dirname(path), { recursive: true });
  put(path, plan);
  outputs = shardIndices.map((index) => join(root, `.metrics/shard-${index}`));
  for (const [offset, output] of outputs.entries()) {
    execFileSync(process.execPath, [helper, "run", path, `${offset + 1}/8`, output], { cwd: root, encoding: "utf8" });
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
    expect(result.score).toContain("50.00%** | **2 / 4**");
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
    expect(assigned).toHaveLength(4);
    expect(new Set(assigned).size).toBe(4);
    expect(assigned.sort()).toEqual([...plan.selectedIds].sort());
    expect(receipts.flatMap((receipt) => receipt.completed).map((item) => item.id).sort()).toEqual(assigned);
    expect(receipts.flatMap((receipt) => receipt.completed).filter((item) => item.outcome === "killed")).toHaveLength(2);
    expect(receipts.flatMap((receipt) => receipt.completed).filter((item) => item.outcome === "survived")).toHaveLength(2);
  });

  it("rejects missing, repeated, cancelled, and baseline-failed shards", () => {
    expect(() => aggregate(root, plan, outputs.slice(1))).toThrow(/Missing/);
    expect(() => aggregate(root, plan, [...outputs.slice(0, -1), outputs[0]])).toThrow(/duplicate|indices/);
    for (const mutate of [
      (receipt) => { receipt.complete = false; },
      (receipt) => { receipt.code = 2; },
      (receipt) => { receipt.plan.base = "0".repeat(40); },
      (receipt) => { receipt.shard.count = 2; },
      (receipt) => { receipt.shard.index = 0; },
      (receipt) => { receipt.shard.index = 9; },
      (receipt) => { receipt.shard.index = 1.5; },
      (receipt) => { receipt.shard.index = "1"; }
    ]) {
      changeReceipt(0, mutate, () => expect(() => aggregate(root, plan, outputs)).toThrow());
    }
  });

  it("rejects invalid shard requests before executing mutations", async () => {
    for (const shard of [
      { index: 1, count: 2 },
      { index: 1, count: "8" },
      { index: 0, count: 8 },
      { index: 9, count: 8 },
      { index: 1.5, count: 8 },
      { index: "1", count: 8 },
      { index: NaN, count: 8 },
      { index: Infinity, count: 8 }
    ]) {
      await expect(executeShard(root, plan, shard, join(root, ".metrics/invalid-shard"))).rejects.toThrow();
    }
  });

  it("requires all eight result paths at the public CLI boundary", () => {
    const path = join(root, ".metrics/plan.json");
    const result = execFileSync(process.execPath, [helper, "aggregate", path, ...outputs], { cwd: root, encoding: "utf8" });
    expect(result).toContain("50.00%** | **2 / 4**");
    for (const selected of [outputs.slice(1), [...outputs, outputs[0]]]) {
      const invalid = spawnSync(process.execPath, [helper, "aggregate", path, ...selected], { cwd: root, encoding: "utf8" });
      expect(invalid.status).not.toBe(0);
      expect(invalid.stderr).toContain("Usage: mutation-ci.mjs aggregate");
    }
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

  it("rejects altered partial snapshot outcomes and tallies", () => {
    const index = outputs.findIndex((output) => json(join(output, "receipt.json")).completed.length > 0);
    expect(index).toBeGreaterThanOrEqual(0);
    const receipt = json(join(outputs[index], "receipt.json"));
    const result = aggregate(root, plan, outputs);
    expect(result.snapshots.length).toBeGreaterThan(0);
    const snapshot = join(outputs[index], "metrics/packages.agents.src.math.json");
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

it("pins every CI checkout and preserves complete target, budget, and aggregate contracts", () => {
  const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/mutation-changed.yml", import.meta.url), "utf8"));
  expect(workflow.permissions).toEqual({ contents: "read" });
  const jobs = workflow.jobs;
  expect(jobs["mutate-changed"].strategy).toEqual({ "fail-fast": false, matrix: { shard: shardIndices } });
  expect(jobs["mutate-changed"].steps.find((step) => step.name === "Mutate every assigned changed-function site").run)
    .toBe('node scripts/mutation-ci.mjs run .metrics/mutation-ci/plan.json "$SHARD/8" ".metrics/mutation-ci/shard-$SHARD"');
  const aggregateCommand = jobs["mutation-complete"].steps.find((step) => step.name === "Verify the exact union and report survivors").run;
  expect(aggregateCommand.trim().split(/\s+/)).toEqual([
    "node", "scripts/mutation-ci.mjs", "aggregate", ".metrics/mutation-ci/plan.json",
    ...shardIndices.map((index) => `.metrics/mutation-ci/results/mutation-result-shard-${index}`)
  ]);
  for (const job of Object.values(jobs)) {
    expect(job["timeout-minutes"]).toBe(45);
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
