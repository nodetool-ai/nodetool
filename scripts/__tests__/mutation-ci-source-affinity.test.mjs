import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aggregate, createPlan, sourceWorkloads, TARGETS } from "../mutation-ci.mjs";

const helper = new URL("../mutation-ci.mjs", import.meta.url).pathname;
const shardIndices = [1, 2, 3, 4, 5, 6, 7, 8];
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const put = (path, value) => writeFileSync(path, `${JSON.stringify(value)}\n`);

it("does not repeat unrelated source baselines inside one source-affinity job", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "mutation-ci-affinity-"));
  const fixtureGit = (...args) => execFileSync("git", ["-C", fixtureRoot, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }).trim();
  for (const target of TARGETS) {
    mkdirSync(join(fixtureRoot, target), { recursive: true });
    writeFileSync(join(fixtureRoot, target, ".keep"), "");
  }
  writeFileSync(join(fixtureRoot, ".gitignore"), "/.metrics/\n/target/\n");
  for (const name of ["agents", "auth"]) {
    const directory = join(fixtureRoot, "packages", name);
    mkdirSync(join(directory, "tests"));
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name, type: "module", scripts: { test: "node tests/run.mjs" } }));
    writeFileSync(join(directory, "src/math.mjs"), "export const previous = true;\n");
    writeFileSync(join(directory, "tests/run.mjs"), [
      "import * as values from '../src/math.mjs';",
      "import { appendFileSync } from 'node:fs';",
      "appendFileSync(process.env.MUTATION_AFFINITY_TRACE, JSON.stringify({cwd: process.cwd()}) + '\\n');",
      "for (let i = 0; i < 6; i++) { if (!values['positive' + i](i + 1) || values['positive' + i](i)) process.exit(1); }"
    ].join("\n"));
  }
  fixtureGit("init", "-q");
  fixtureGit("add", ".");
  fixtureGit("-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "base");
  const base = fixtureGit("rev-parse", "HEAD");
  for (const name of ["agents", "auth"]) {
    writeFileSync(join(fixtureRoot, "packages", name, "src/math.mjs"), Array.from({ length: 6 }, (_, index) =>
      `export function positive${index}(n) { return n > ${index}; }`).join("\n"));
  }
  fixtureGit("add", ".");
  fixtureGit("-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "source contracts");
  const fixturePlan = createPlan(fixtureRoot, base);
  const { belongsToShard } = await import("../../packages/mutator/dist/shards.js");
  const originallyMixed = shardIndices.find((index) => fixturePlan.files.filter((file) =>
    file.selectedIds.some((id) => belongsToShard(id, { index, count: 8 }))).length === 2);
  expect(originallyMixed).toBeDefined();
  const trace = join(fixtureRoot, ".metrics/commands.ndjson");
  mkdirSync(dirname(trace), { recursive: true });
  writeFileSync(trace, "");
  const previous = process.env.MUTATION_AFFINITY_TRACE;
  process.env.MUTATION_AFFINITY_TRACE = trace;
  try {
    const output = join(fixtureRoot, ".metrics/source-affinity");
    const planPath = join(fixtureRoot, ".metrics/plan.json");
    put(planPath, fixturePlan);
    execFileSync(process.execPath, [helper, "run", planPath, `${originallyMixed}/8`, output], {
      cwd: fixtureRoot, encoding: "utf8"
    });
    const receipt = json(join(output, "receipt.json"));
    expect(receipt.complete).toBe(true);
    expect(receipt.completed.length).toBeGreaterThan(0);
    expect(receipt.completed.map(({ id }) => id).sort()).toEqual([...receipt.assignedIds].sort());
    const invocations = readFileSync(trace, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(invocations.length).toBeGreaterThan(0);
    const baselines = invocations.filter(({ cwd }) => ["agents", "auth"].some((name) => cwd === join(fixtureRoot, "packages", name)));
    expect(baselines).toHaveLength(1);
    const sourceFiles = new Set(receipt.assignedIds.map((id) => JSON.parse(id)[0]));
    expect(sourceFiles.size).toBe(1);
  } finally {
    if (previous === undefined) { delete process.env.MUTATION_AFFINITY_TRACE; }
    else { process.env.MUTATION_AFFINITY_TRACE = previous; }
  }
});


function createFixture() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "mutation-ci-affinity-"));
  const fixtureGit = (...args) => execFileSync("git", ["-C", fixtureRoot, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }).trim();
  for (const target of TARGETS) {
    mkdirSync(join(fixtureRoot, target), { recursive: true });
    writeFileSync(join(fixtureRoot, target, ".keep"), "");
  }
  writeFileSync(join(fixtureRoot, ".gitignore"), "/.metrics/\n/target/\n");
  for (const name of ["agents", "auth"]) {
    const directory = join(fixtureRoot, "packages", name);
    mkdirSync(join(directory, "tests"));
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name, type: "module", scripts: { test: "node tests/run.mjs" } }));
    writeFileSync(join(directory, "src/math.mjs"), "export const previous = true;\n");
    writeFileSync(join(directory, "tests/run.mjs"), [
      "import * as values from '../src/math.mjs';",
      "import { appendFileSync } from 'node:fs';",
      "appendFileSync(process.env.MUTATION_AFFINITY_TRACE, JSON.stringify({cwd: process.cwd()}) + '\\n');",
      "for (let i = 0; i < 6; i++) { if (!values['positive' + i](i + 1) || values['positive' + i](i)) process.exit(1); }"
    ].join("\n"));
  }
  fixtureGit("init", "-q");
  fixtureGit("add", ".");
  fixtureGit("-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "base");
  const base = fixtureGit("rev-parse", "HEAD");
  for (const name of ["agents", "auth"]) {
    writeFileSync(join(fixtureRoot, "packages", name, "src/math.mjs"), Array.from({ length: 6 }, (_, index) =>
      `export function positive${index}(n) { return n > ${index}; }`).join("\n"));
  }
  fixtureGit("add", ".");
  fixtureGit("-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "source contracts");
  const fixturePlan = createPlan(fixtureRoot, base);
  return { fixtureRoot, fixturePlan };
 }

it.each([
  [], [0], [1], [520, 14], [39, 52], [0, 5, 0],
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1]
])("partitions the exact source-local site union for counts %j", async (...counts) => {
  const { belongsToShard } = await import("../../packages/mutator/dist/shards.js");
  const files = counts.map((count, index) => ({ file: `packages/package-${index}/src/same.mjs`,
    selectedIds: Array.from({ length: count }, (_, site) => JSON.stringify([index, site])) }));
  const jobs = sourceWorkloads(files);
  expect(jobs.map(({ index }) => index)).toEqual(shardIndices);
  expect(sourceWorkloads([...files].reverse())).toEqual(jobs);
  const actual = jobs.flatMap((job) => job.sources.flatMap((source) => {
    const file = files.find(({ file }) => file === source.file);
    expect(file).toBeDefined();
    return file.selectedIds.filter((id) => belongsToShard(id, source.shard));
  }));
  expect(actual.sort()).toEqual(files.flatMap(({ selectedIds }) => selectedIds).sort());
  expect(new Set(actual).size).toBe(actual.length);
  for (const file of files) {
    const scopes = jobs.flatMap(({ sources }) => sources.filter((source) => source.file === file.file));
    expect(scopes.length).toBeGreaterThan(0);
    expect(scopes.every(({ shard }) => shard.count === scopes.length)).toBe(true);
    expect(scopes.map(({ shard }) => shard.index).sort((a, b) => a - b)).toEqual(
      Array.from({ length: scopes.length }, (_, index) => index + 1));
  }
});

it("handles thousands of distinct sources without merging duplicate basenames", () => {
  const files = Array.from({ length: 4096 }, (_, index) => ({ file: `packages/p${index}/src/same.mjs`,
    selectedIds: [JSON.stringify([index, 0])] }));
  const jobs = sourceWorkloads(files);
  expect(jobs).toHaveLength(8);
  expect(jobs.every(({ sources }) => sources.length === 512)).toBe(true);
  expect(new Set(jobs.flatMap(({ sources }) => sources.map(({ file }) => file))).size).toBe(4096);
});

describe("real source-local invocations and aggregation", { concurrent: false }, () => {
  let fixtureRoot;
  let fixturePlan;
  let planPath;
  let outputs;
  let previousTrace;
  beforeAll(() => {
    ({ fixtureRoot, fixturePlan } = createFixture());
    planPath = join(fixtureRoot, ".metrics/plan.json");
    mkdirSync(dirname(planPath), { recursive: true });
    put(planPath, fixturePlan);
    outputs = shardIndices.map((index) => join(fixtureRoot, `.metrics/shard-${index}`));
    previousTrace = process.env.MUTATION_AFFINITY_TRACE;
    process.env.MUTATION_AFFINITY_TRACE = join(fixtureRoot, ".metrics/commands.ndjson");
    writeFileSync(process.env.MUTATION_AFFINITY_TRACE, "");
  });
  afterAll(() => {
    if (previousTrace === undefined) { delete process.env.MUTATION_AFFINITY_TRACE; }
    else { process.env.MUTATION_AFFINITY_TRACE = previousTrace; }
  });
  it.each(shardIndices)("completes every assigned mutation in job %i", (index) => {
    execFileSync(process.execPath, [helper, "run", planPath, `${index}/8`, outputs[index - 1]], {
      cwd: fixtureRoot, encoding: "utf8"
    });
    const receipt = json(join(outputs[index - 1], "receipt.json"));
    expect(receipt.complete).toBe(true);
    expect(receipt.completed.map(({ id }) => id).sort()).toEqual([...receipt.assignedIds].sort());
    expect(receipt.invocations).toHaveLength(1);
    expect(receipt.invocations[0].files).toHaveLength(1);
  });
  it("aggregates the identical full union and rejects omitted invocation evidence", () => {
    const result = aggregate(fixtureRoot, fixturePlan, outputs);
    expect(fixturePlan.selectedIds).toHaveLength(16);
    expect(result.snapshots.length).toBeGreaterThan(0);
    expect(outputs.flatMap((output) => json(join(output, "receipt.json")).completed).map(({ id }) => id).sort())
      .toEqual([...fixturePlan.selectedIds].sort());
    const path = join(outputs[0], "receipt.json");
    const before = readFileSync(path, "utf8");
    try {
      const receipt = JSON.parse(before);
      receipt.invocations = [];
      put(path, receipt);
      expect(() => aggregate(fixtureRoot, fixturePlan, outputs)).toThrow(/invocations/);
    } finally { writeFileSync(path, before); }
  });
  it.each(["global", "invocation"])("rejects a duplicated %s journal entry", (kind) => {
    const output = outputs.find((path) => json(join(path, "receipt.json")).completed.length > 0);
    const path = kind === "global" ? join(output, "completed.ndjson") : join(output, "invocations/1/completed.ndjson");
    const before = readFileSync(path, "utf8");
    try {
      writeFileSync(path, before + before.split("\n")[0] + "\n");
      expect(() => aggregate(fixtureRoot, fixturePlan, outputs)).toThrow(/journal/);
    } finally { writeFileSync(path, before); }
  });
  it("rejects duplicated invocations and a forged source scope", () => {
    const output = outputs.find((path) => json(join(path, "receipt.json")).completed.length > 0);
    const path = join(output, "receipt.json");
    const localPath = join(output, "invocations/1/receipt.json");
    const before = readFileSync(path, "utf8");
    const localBefore = readFileSync(localPath, "utf8");
    try {
      const receipt = JSON.parse(before);
      receipt.invocations.push(receipt.invocations[0]);
      put(path, receipt);
      expect(() => aggregate(fixtureRoot, fixturePlan, outputs)).toThrow(/invocations/);
      const forged = JSON.parse(before);
      forged.invocations[0].files = ["packages/agents/src/not-selected.mjs"];
      put(path, forged);
      put(localPath, forged.invocations[0]);
      expect(() => aggregate(fixtureRoot, fixturePlan, outputs)).toThrow(/frozen source assignment/);
    } finally { writeFileSync(path, before); writeFileSync(localPath, localBefore); }
  });

});


describe("grouped sources with selected-zero files", { concurrent: false }, () => {
  let fixtureRoot;
  let fixturePlan;
  let planPath;
  let outputs;
  let previousTrace;
  beforeAll(() => {
    const initial = createFixture();
    fixtureRoot = initial.fixtureRoot;
    for (let index = 0; index < 9; index++) {
      writeFileSync(join(fixtureRoot, `packages/agents/src/source${index}.mjs`), "export const previous = 1;\n");
    }
    execFileSync("git", ["-C", fixtureRoot, "add", "."]);
    execFileSync("git", ["-C", fixtureRoot, "-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "source placeholders"]);
    const base = execFileSync("git", ["-C", fixtureRoot, "rev-parse", "HEAD"], {encoding:"utf8"}).trim();
    for (const name of ["agents", "auth"]) {
      const path = join(fixtureRoot, "packages", name, "src/math.mjs");
      writeFileSync(path, readFileSync(path, "utf8") + "\n// Only a comment changed.\n");
    }
    for (let index = 0; index < 9; index++) {
      writeFileSync(join(fixtureRoot, `packages/agents/src/source${index}.mjs`), "export function positive(n) { return n > 0; }\n");
    }
    writeFileSync(join(fixtureRoot, "packages/agents/tests/run.mjs"), [
      "import {appendFileSync} from 'node:fs';",
      "appendFileSync(process.env.MUTATION_AFFINITY_TRACE, JSON.stringify({cwd:process.cwd()}) + '\\n');",
      ...Array.from({length: 9}, (_, index) => `import {positive as p${index}} from '../src/source${index}.mjs';`),
      ...Array.from({length: 9}, (_, index) => `if (!p${index}(1) || p${index}(0)) process.exit(1);`)
    ].join("\n"));
    execFileSync("git", ["-C", fixtureRoot, "add", "."]);
    execFileSync("git", ["-C", fixtureRoot, "-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "grouped and zero sources"]);
    fixturePlan = createPlan(fixtureRoot, base);
    planPath = join(fixtureRoot, ".metrics/plan.json");
    mkdirSync(dirname(planPath), {recursive:true});
    put(planPath, fixturePlan);
    outputs = shardIndices.map((index) => join(fixtureRoot, `.metrics/shard-${index}`));
    previousTrace = process.env.MUTATION_AFFINITY_TRACE;
    process.env.MUTATION_AFFINITY_TRACE = join(fixtureRoot, ".metrics/commands.ndjson");
    writeFileSync(process.env.MUTATION_AFFINITY_TRACE, "");
  });
  afterAll(() => {
    if (previousTrace === undefined) { delete process.env.MUTATION_AFFINITY_TRACE; }
    else { process.env.MUTATION_AFFINITY_TRACE = previousTrace; }
  });
  it.each(shardIndices)("retains exact source scope in grouped job %i", (index) => {
    const trace = process.env.MUTATION_AFFINITY_TRACE;
    const before = readFileSync(trace, "utf8").split("\n").filter(Boolean).length;
    execFileSync(process.execPath, [helper, "run", planPath, `${index}/8`, outputs[index - 1]], {cwd:fixtureRoot,encoding:"utf8"});
    const receipt = json(join(outputs[index - 1], "receipt.json"));
    expect(receipt.complete).toBe(true);
    expect(receipt.invocations).toHaveLength(1);
    expect(receipt.invocations[0].shard).toEqual({index:1,count:1});
    const commands = readFileSync(trace, "utf8").split("\n").filter(Boolean).slice(before).map((line) => JSON.parse(line));
    expect(commands.filter(({cwd}) => cwd === join(fixtureRoot, "packages/agents"))).toHaveLength(1);
  });
  it("keeps zero-selection source snapshots and shared full baseline cache", () => {
    expect(fixturePlan.files).toHaveLength(11);
    expect(fixturePlan.files.filter(({selectedIds}) => selectedIds.length === 0)).toHaveLength(2);
    expect(fixturePlan.workloads.some(({sources}) => sources.filter(({file}) => /source\d/.test(file)).length > 1)).toBe(true);
    const result = aggregate(fixtureRoot, fixturePlan, outputs);
    expect(result.snapshots.map(({source}) => source).sort()).toEqual(fixturePlan.files.map(({file}) => file).sort());
  });
});


describe("empty canonical mutation selection", { concurrent: false }, () => {
  let fixtureRoot;
  let fixturePlan;
  let planPath;
  let outputs;
  beforeAll(() => {
    const initial = createFixture();
    fixtureRoot = initial.fixtureRoot;
    for (const name of ["agents", "auth"]) {
      const path = join(fixtureRoot, "packages", name, "src/math.mjs");
      writeFileSync(path, readFileSync(path, "utf8") + "\n// Only a comment changed.\n");
      writeFileSync(join(fixtureRoot, "packages", name, "tests/run.mjs"), "throw new Error('An empty selection must not run a baseline');\n");
    }
    execFileSync("git", ["-C", fixtureRoot, "add", "."]);
    execFileSync("git", ["-C", fixtureRoot, "-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "empty selection"]);
    fixturePlan = createPlan(fixtureRoot, initial.fixturePlan.head);
    planPath = join(fixtureRoot, ".metrics/plan.json");
    mkdirSync(dirname(planPath), {recursive:true});
    put(planPath, fixturePlan);
    outputs = shardIndices.map((index) => join(fixtureRoot, `.metrics/shard-${index}`));
  });
  it.each(shardIndices)("emits a complete empty receipt for job %i", (index) => {
    execFileSync(process.execPath, [helper, "run", planPath, `${index}/8`, outputs[index - 1]], {cwd:fixtureRoot,encoding:"utf8"});
    expect(json(join(outputs[index - 1], "receipt.json"))).toMatchObject({assignedIds:[],completed:[],code:0,complete:true});
  });
  it("still requires all jobs and keeps source form evidence", () => {
    expect(fixturePlan.selectedIds).toEqual([]);
    expect(aggregate(fixtureRoot, fixturePlan, outputs).snapshots).toHaveLength(2);
    expect(() => aggregate(fixtureRoot, fixturePlan, outputs.slice(1))).toThrow(/Missing/);
  });
});


it("retains the actual failed baseline exit and incomplete invocation receipts", () => {
  const initial = createFixture();
  const { fixtureRoot } = initial;
  for (const name of ["agents", "auth"]) {
    writeFileSync(join(fixtureRoot, "packages", name, "tests/run.mjs"), "throw new Error('Deliberately invalid baseline');\n");
  }
  execFileSync("git", ["-C", fixtureRoot, "add", "."]);
  execFileSync("git", ["-C", fixtureRoot, "-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "invalid baseline"]);
  const fixturePlan = createPlan(fixtureRoot, initial.fixturePlan.base);
  const planPath = join(fixtureRoot, ".metrics/plan.json");
  mkdirSync(dirname(planPath), {recursive:true});
  put(planPath, fixturePlan);
  const output = join(fixtureRoot, ".metrics/failed-shard");
  const result = spawnSync(process.execPath, [helper, "run", planPath, "1/8", output], {cwd:fixtureRoot,encoding:"utf8"});
  expect(result.status).not.toBe(0);
  const receipt = json(join(output, "receipt.json"));
  expect(receipt).toMatchObject({complete:false,code:2,completed:[]});
  expect(receipt.invocations[0]).toMatchObject({complete:false,code:2,completed:[]});
  expect(json(join(output, "invocations/1/receipt.json"))).toEqual(receipt.invocations[0]);
  expect(readFileSync(join(output, "completed.ndjson"), "utf8")).toBe("");
});


it("allocates the fixed jobs by site count before hashing within each source", () => {
  for (const [counts, expected] of [[[520, 14], [7, 1]], [[39, 52], [3, 5]]]) {
    const files = counts.map((count, index) => ({file:`packages/p${index}/src/same.mjs`,
      selectedIds:Array.from({length:count}, (_, site) => `${index}-${site}`)}));
    const jobs = sourceWorkloads(files);
    expect(jobs.every(({sources}) => sources.length === 1)).toBe(true);
    expect(files.map(({file}) => jobs.filter(({sources}) => sources.some((source) => source.file === file)).length))
      .toEqual(expected);
  }
});
