import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { computeAffected, EXTRA_WORKSPACE_PATHS } from "../../packages/cli/src/affected/affected.ts";
import { partitionPlan, runCommands, validatePlan } from "../packed-verification.mjs";
import { buildPlan, fullPlan, readPackages } from "../test-affected.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const packages = readPackages(EXTRA_WORKSPACE_PATHS);
const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;
const partition = (steps) => partitionPlan(steps, packages, scripts);
const turboCommands = (jobs) => jobs.flatMap(({ commands }) => commands).filter(({ command, args }) => command === "node" && args[0] === "scripts/run-turbo.mjs");
const identity = { sha: "a".repeat(40), tree: "b".repeat(40), base: "c".repeat(40), mergeBase: "d".repeat(40) };

function testTaskIds(filters) {
  const json = execFileSync(process.execPath, ["scripts/run-turbo.mjs", "run", "test", "--dry-run=json", ...filters], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024
  });
  return JSON.parse(json).tasks.filter(({ task }) => task === "test").map(({ taskId }) => taskId);
}

describe("Packed verification partition", () => {
  it("preserves every real Turbo test task exactly once for full and affected plans", () => {
    const cases = [
      { steps: fullPlan(), filters: ["--filter=./packages/*", "--filter=./reliability/*"] },
      ...["packages/protocol/src/types.ts", "demo/src/probe.ts"].map((file) => {
        const steps = buildPlan([file], packages, computeAffected).steps;
        const original = steps.find(({ command, args }) => command === "node" && args[0] === "scripts/run-turbo.mjs");
        expect(original, file).toBeDefined();
        return { steps, filters: original.args.slice(3) };
      })
    ];
    for (const { steps, filters } of cases) {
      const original = testTaskIds(filters).sort();
      expect(original.length).toBeGreaterThan(0);
      const actual = turboCommands(partition(steps)).flatMap(({ args }) => testTaskIds(args.slice(3))).sort();
      expect(actual).toEqual(original);
      expect(new Set(actual).size).toBe(actual.length);
    }
  }, 120_000);

  it("retains every workspace selection, app argv and app order", () => {
    for (const pkg of packages) {
      const steps = buildPlan([`${pkg.dir}/src/probe.ts`], packages, computeAffected).steps;
      const jobs = partition(steps);
      const original = steps.filter(({ command, args }) => command === "node" && args[0] === "scripts/run-turbo.mjs");
      const full = steps.some(({ command, args }) => command === "npm" && args.join(" ") === "run test:packages");
      if (full) {
        continue; // The real Turbo full-plan oracle covers this expansion.
      }
      expect(turboCommands(jobs).flatMap(({ args }) => args.slice(3)).sort(), pkg.name)
        .toEqual(original.flatMap(({ args }) => args.slice(3)).sort());
      expect(jobs.find(({ id }) => id === "apps-and-path-checks")?.commands ?? [])
        .toEqual(steps.filter((step) => !original.includes(step)));
    }
    const fallback = partition(buildPlan(["demo/src/probe.ts"], packages, computeAffected).steps);
    expect(fallback.find(({ id }) => id === "test-packages-other")?.commands.length).toBeGreaterThan(0);
    const game = partition(fullPlan()).find(({ id }) => id === "test-packages-game");
    expect(game.commands.find(({ args }) => args[0] === "scripts/run-turbo.mjs").args.slice(3).sort()).toEqual([
      "--filter=@nodetool-ai/cli", "--filter=@nodetool-ai/game-renderer", "--filter=@nodetool-ai/game-runtime"
    ]);
    const fullJobs = partition(fullPlan());
    expect(fullJobs.find(({ id }) => id === "apps-and-path-checks").commands).toEqual(fullPlan().filter(({ command, args }) => !(command === "npm" && args.join(" ") === "run test:packages")));
    const rootChecks = fullJobs.flatMap(({ commands }) => commands).filter(({ command, args }) => command === "npm" && ["test:oxlint-rules", "test:scripts"].includes(args[1]));
    expect(rootChecks.map(({ args }) => args)).toEqual([["run", "test:oxlint-rules"], ["run", "test:scripts"]]);
  });

  it("prepares the native worker in the isolated websocket test job", () => {
    const steps = buildPlan(["packages/websocket/src/lib/native-game-worker.ts"], packages, computeAffected).steps;
    const job = partition(steps).find(({ commands }) => commands.some(({ command, args }) => command === "node" && args.includes("--filter=@nodetool-ai/websocket")));
    expect(job).toBeDefined();
    expect(job.commands[0]).toMatchObject({ command: "node", args: ["scripts/check-native-game.mjs"] });
  });

  it.each(["@nodetool-ai/agents", "@nodetool-ai/game-runtime", "@nodetool-ai/cli"])("prepares the native worker in the isolated %s job", (name) => {
    const jobs = partition([{ command: "node", args: ["scripts/run-turbo.mjs", "run", "test", `--filter=${name}`] }]);
    const job = jobs.find(({ commands }) => commands.some(({ args }) => args.includes(`--filter=${name}`)));
    expect(job.commands[0]).toMatchObject({ command: "node", args: ["scripts/check-native-game.mjs"] });
  });

  it("rejects changed npm lifecycle or Turbo semantics instead of omitting them", () => {
    for (const change of [
      { "test:packages": "npm run different-tests" },
      { "pretest:packages": "node before.mjs" },
      { "posttest:packages": "node after.mjs" }
    ]) {
      expect(() => partitionPlan(fullPlan(), packages, { ...scripts, ...change })).toThrow(/adapter/);
    }
    for (const filter of ["--continue", "--filter=./packages/*", "--filter=missing-workspace"]) {
      expect(() => partition([{ command: "node", args: ["scripts/run-turbo.mjs", "run", "test", filter] }])).toThrow();
    }
    expect(() => partition([{ command: "node", args: ["scripts/run-turbo.mjs", "run", "test"] }])).toThrow(/unfiltered/);
  });

  it("rejects omitted, duplicated and replaced commands and changed source/base pins", () => {
    const jobs = partition(fullPlan());
    const plan = { version: 1, ...identity, files: ["package-lock.json"], jobs };
    expect(() => validatePlan(plan, identity, jobs, plan.files)).not.toThrow();
    for (const invalid of [
      { ...plan, jobs: jobs.slice(1) },
      { ...plan, jobs: [...jobs, jobs[0]] },
      { ...plan, jobs: jobs.map((job) => job.id === "apps-and-path-checks" ? { ...job, commands: [{ command: "npm", args: ["run", "lint"] }] } : job) },
      { ...plan, files: [] },
      ...Object.keys(identity).map((key) => ({ ...plan, [key]: "e".repeat(40) })),
      { ...plan, base: null }
    ]) {
      expect(() => validatePlan(invalid, identity, jobs, plan.files)).toThrow();
    }
  });

  it("the real CLI restores the frozen base, rejects incomplete plans and propagates selected test failure", () => {
    const dir = mkdtempSync(join(tmpdir(), "packed-plan-"));
    const checkout = join(dir, "checkout");
    mkdirSync(checkout);
    const git = (...args) => execFileSync("git", args, { cwd: checkout, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    const artifact = join(dir, "plan.json");
    const invoke = (...args) => spawnSync(process.execPath, ["scripts/packed-verification.mjs", ...args], {
      cwd: checkout, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: join(dir, "outputs") }
    });
    try {
      for (const file of ["scripts/packed-verification.mjs", "scripts/test-affected.mjs", "scripts/ci-plan.mjs", "packages/cli/src/affected/affected.ts"]) {
        mkdirSync(dirname(join(checkout, file)), { recursive: true });
        cpSync(join(ROOT, file), join(checkout, file));
      }
      mkdirSync(join(checkout, "web/src"), { recursive: true });
      writeFileSync(join(checkout, "package.json"), JSON.stringify({ private: true, type: "module", workspaces: ["web"], scripts }));
      writeFileSync(join(checkout, "web/package.json"), JSON.stringify({ name: "nodetool", version: "1.0.0", scripts: { test: "node fail.cjs" } }));
      writeFileSync(join(checkout, "web/fail.cjs"), "process.exit(7);\n");
      git("init");
      git("config", "user.email", "test@example.invalid");
      git("config", "user.name", "Packed fixture");
      git("add", ".");
      git("commit", "-m", "base");
      const base = git("rev-parse", "HEAD");
      git("update-ref", "refs/remotes/origin/main", base);
      writeFileSync(join(checkout, "web/src/probe.js"), "export const changed = true;\n");
      git("add", ".");
      git("commit", "-m", "app change");
      const planned = invoke("plan", artifact);
      expect(planned.status, planned.stderr).toBe(0);
      const plan = JSON.parse(readFileSync(artifact, "utf8"));
      expect(plan.files).toEqual(["web/src/probe.js"]);
      expect(plan.base).toBe(base);
      git("commit", "--allow-empty", "-m", "main advances");
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      git("checkout", "--detach", plan.sha);
      const prepared = invoke("prepare", artifact);
      expect(prepared.status, prepared.stderr).toBe(0);
      expect(git("rev-parse", "origin/main")).toBe(base);
      const failedTest = invoke("run", artifact, "apps-and-path-checks");
      expect(failedTest.status, failedTest.stderr).toBe(7);
      const unknown = invoke("run", artifact, "missing-task");
      expect(unknown.status).toBe(1);
      expect(unknown.stderr).toContain("Unknown or empty Packed task");
      writeFileSync(artifact, JSON.stringify({ ...plan, jobs: plan.jobs.slice(1) }));
      expect(invoke("prepare", artifact).status).toBe(1);
      writeFileSync(artifact, JSON.stringify({ ...plan, files: [], jobs: partitionPlan([], [], scripts) }));
      const omittedSelection = invoke("prepare", artifact);
      expect(omittedSelection.status).toBe(1);
      expect(omittedSelection.stderr).toContain("files differ from the frozen Git selection");
      git("update-ref", "-d", "refs/remotes/origin/main");
      const unresolved = invoke("plan", join(dir, "unresolved.json"));
      expect(unresolved.status).toBe(1);
      expect(existsSync(join(dir, "unresolved.json"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("propagates a real command failure and stops before subsequent commands", () => {
    const dir = mkdtempSync(join(tmpdir(), "packed-command-"));
    const marker = join(dir, "unexpected");
    try {
      expect(runCommands([
        { label: "intentional failure", command: process.execPath, args: ["-e", "process.exit(3)"] },
        { label: "must not run", command: process.execPath, args: ["-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, '')`] }
      ])).toBe(3);
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the workflow runs the complete artifact matrix with original budgets and serial limits", () => {
    const workflow = readFileSync(join(ROOT, ".github/workflows/packed-core-cli.yml"), "utf8");
    expect(workflow).toContain("matrix: ${{ fromJSON(needs.verification-plan.outputs.matrix) }}");
    expect(workflow).toContain("ref: ${{ needs.verification-plan.outputs.sha }}");
    expect(workflow).toContain('packed-verification.mjs prepare "$RUNNER_TEMP/packed-verification.json"');
    expect(workflow).toContain('packed-verification.mjs run "$RUNNER_TEMP/packed-verification.json" "$PACKED_TASK"');
    expect(workflow).toMatch(/verification:\n[\s\S]*?timeout-minutes: 90/);
    expect(workflow).toContain('NODETOOL_TURBO_CONCURRENCY: "1"');
    expect(workflow).toContain('NODETOOL_TEST_WORKERS: "1"');
    expect(workflow).toContain("fail-fast: false");
    expect(workflow).toContain("needs: [verification-plan, verification, packed-install]");
    for (const result of ["PLAN_RESULT", "VERIFICATION_RESULT", "PACKED_INSTALL_RESULT"]) {
      expect(workflow).toContain(`"$${result}" != "success"`);
    }
    for (const path of ["scripts/packed-verification.mjs", "scripts/test-affected.mjs", "scripts/ci-plan.mjs", "scripts/__tests__/packed-verification.test.mjs"]) {
      expect(workflow).toContain(`- '${path}'`);
    }
  });
});
