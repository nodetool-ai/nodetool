#!/usr/bin/env node
/** Partition the canonical affected plan across isolated Packed CI runners. */
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { computeAffected, EXTRA_WORKSPACE_PATHS } from "../packages/cli/src/affected/affected.ts";
import { shardOf } from "./ci-plan.mjs";
import { buildPlan, changedFiles, readPackages } from "./test-affected.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FULL_BACKEND_SCRIPT = 'npm run test:oxlint-rules && npm run test:scripts && node scripts/run-turbo.mjs run test --filter="./packages/*" --filter="./reliability/*"';
const GAME_PACKAGES = new Set([
  "@nodetool-ai/game-runtime", "@nodetool-ai/game-renderer", "@nodetool-ai/cli"
]);
const TURBO_PREFIX = ["scripts/run-turbo.mjs", "run", "test"];
const FIXED_STEPS = [
  { label: "types", command: "npm", args: ["run", "typecheck"] },
  { label: "lint", command: "npm", args: ["run", "lint"] },
  { label: "harnesses", command: "npm", args: ["run", "dev:nodetool", "--", "harness", "gate", "--base", "origin/main", "--jobs", "1"] },
  { label: "packaged backend", command: "npm", args: ["run", "backend:smoke"] }
];

/** Preserve command order within each bucket and retain every selected package. */
export function partitionPlan(steps, packages, scripts) {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const jobs = new Map();
  const add = (id, step) => {
    if (!jobs.has(id)) {
      jobs.set(id, []);
    }
    jobs.get(id).push(step);
  };
  for (const step of steps) {
    const full = step.command === "npm" && JSON.stringify(step.args) === '["run","test:packages"]';
    const turbo = step.command === "node" && TURBO_PREFIX.every((arg, index) => step.args[index] === arg);
    if (!full && !turbo) {
      add("apps-and-path-checks", step);
      continue;
    }
    if (full && (scripts["test:packages"] !== FULL_BACKEND_SCRIPT || scripts["pretest:packages"] || scripts["posttest:packages"])) {
      throw new Error("test:packages changed; update the Packed partition adapter before running it.");
    }
    if (full) {
      for (const script of ["test:oxlint-rules", "test:scripts"]) {
        add("test-packages-core", { label: script, command: "npm", args: ["run", script] });
      }
    }
    const names = full
      ? packages.filter((pkg) => pkg.dir.startsWith("packages/") || pkg.dir.startsWith("reliability/")).map((pkg) => pkg.name)
      : step.args.slice(TURBO_PREFIX.length).map((arg) => {
        if (!arg.startsWith("--filter=")) {
          throw new Error(`Unsupported affected test argument: ${arg}`);
        }
        return arg.slice("--filter=".length);
      });
    if (!full && names.length === 0) {
      throw new Error("An unfiltered Turbo test command needs an explicit Packed adapter.");
    }
    const buckets = new Map();
    for (const name of names) {
      const pkg = byName.get(name);
      if (!pkg) {
        throw new Error(`Unknown selected workspace: ${name}`);
      }
      const id = GAME_PACKAGES.has(name) ? "test-packages-game" : (shardOf(name, pkg.dir) ?? "test-packages-other");
      if (!buckets.has(id)) {
        buckets.set(id, []);
      }
      buckets.get(id).push(`--filter=${name}`);
    }
    for (const [id, filters] of buckets) {
      // Packed jobs have isolated filesystems, so the worker must be built in
      // the same job that exercises native runtime, CLI, or agent integration.
      if (filters.some((filter) => ["@nodetool-ai/websocket", "@nodetool-ai/game-runtime", "@nodetool-ai/cli", "@nodetool-ai/agents"].some((name) => filter === `--filter=${name}`))) {
        add(id, { label: "native game worker prerequisite", command: "node", args: ["scripts/check-native-game.mjs"] });
      }
      add(id, { label: id, command: "node", args: [...TURBO_PREFIX, ...filters] });
    }
  }
  jobs.set("fixed-checks", FIXED_STEPS);
  return [...jobs].map(([id, commands]) => ({ id, commands }));
}

function git(...args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function selectedJobs(files) {
  const packages = readPackages(EXTRA_WORKSPACE_PATHS);
  const manifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  return partitionPlan(buildPlan(files, packages, computeAffected).steps, packages, manifest.scripts);
}

/** Validate against source-derived commands, not just artifact-provided job IDs. */
export function validatePlan(plan, identity, jobs, files) {
  if (plan.version !== 1 || !Array.isArray(plan.files) || !plan.files.every((file) => typeof file === "string")) {
    throw new Error("Invalid Packed verification plan.");
  }
  for (const key of ["sha", "tree", "base", "mergeBase"]) {
    if (!/^[a-f0-9]{40}$/.test(plan[key] ?? "") || plan[key] !== identity[key]) {
      throw new Error(`Packed verification ${key} does not match the frozen source.`);
    }
  }
  if (JSON.stringify(plan.files) !== JSON.stringify(files)) {
    throw new Error("Packed verification files differ from the frozen Git selection.");
  }
  if (JSON.stringify(plan.jobs) !== JSON.stringify(jobs)) {
    throw new Error("Packed verification commands differ from canonical affected selection.");
  }
}

function identity() {
  return {
    sha: git("rev-parse", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
    base: git("rev-parse", "origin/main^{commit}"),
    mergeBase: git("merge-base", "HEAD", "origin/main")
  };
}

function requireCleanCheckout() {
  if (git("status", "--porcelain").length > 0) {
    throw new Error("Packed verification requires a clean checkout and an artifact outside the working tree.");
  }
}

export function runCommands(commands) {
  for (const { label, command, args } of commands) {
    console.log(`\n${label}: $ ${command} ${args.join(" ")}`);
    const result = spawnSync(command, args, { cwd: repoRoot, stdio: "inherit" });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }
  return 0;
}

function main([operation, path, task]) {
  if (!path || !["plan", "prepare", "run"].includes(operation)) {
    throw new Error("Usage: packed-verification.mjs <plan|prepare|run> <artifact.json> [task]");
  }
  if (operation === "plan") {
    requireCleanCheckout();
    const source = identity(); // Missing origin/main must fail, never select an empty fallback.
    const { files, base } = changedFiles("origin/main");
    if (base !== source.mergeBase) {
      throw new Error("Affected selection base differs from the frozen base.");
    }
    const plan = { version: 1, ...source, files, jobs: selectedJobs(files) };
    writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `sha=${source.sha}\nmatrix=${JSON.stringify({ include: plan.jobs.map(({ id }) => ({ task: id })) })}\n`);
    }
    console.log(JSON.stringify(plan, null, 2));
    return 0;
  }
  const plan = JSON.parse(readFileSync(path, "utf8"));
  requireCleanCheckout();
  if (!/^[a-f0-9]{40}$/.test(plan.base ?? "")) {
    throw new Error("Invalid frozen origin/main commit.");
  }
  // Other jobs may start after origin/main advances. Harness argv stays unchanged.
  git("update-ref", "refs/remotes/origin/main", plan.base);
  const { files } = changedFiles("origin/main");
  validatePlan(plan, identity(), selectedJobs(files), files);
  if (operation === "prepare") {
    return 0;
  }
  const job = plan.jobs.find(({ id }) => id === task);
  if (!job || job.commands.length === 0) {
    throw new Error(`Unknown or empty Packed task: ${task}`);
  }
  return runCommands(job.commands);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
