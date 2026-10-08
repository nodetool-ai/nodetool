#!/usr/bin/env node
/**
 * Which legs of the quality gate a diff needs, decided once per CI run.
 *
 * `test.yml`'s `changes` job runs `plan` and hands the result to
 * `quality-checks.yml`, which builds its `built` matrix from it, so a leg the
 * diff cannot reach never takes a runner. The selection reuses `buildPlan`
 * from `test-affected.mjs`, the same mapping `npm run test:affected` applies
 * locally:
 *
 *   - a changed file outside every workspace that is not documentation, or a
 *     change to the gate's own workflow files, selects everything;
 *   - a backend shard runs when the diff affects a package in its slice;
 *   - web runs `--findRelatedTests` when only files under `web/src` changed,
 *     and its whole suite (sharded by the caller) when a package it depends on
 *     changed;
 *   - electron and mobile run the step `buildPlan` chose for them, through
 *     `run`.
 *
 * Usage:
 *   node scripts/ci-plan.mjs plan [--base <sha>] [--head <sha>]
 *     Print the plan as JSON and, under GitHub Actions, write it to
 *     $GITHUB_OUTPUT as `plan`. No `--base` means a full run.
 *   node scripts/ci-plan.mjs run <web|electron|mobile...> [--base <sha>]
 *     Run the test step the plan chose for each app, in order.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { APPS, buildPlan, fullPlan, readPackages } from "./test-affected.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Files that define the gate itself. A change here runs every leg. */
export const GATE_FILES =
  /^\.github\/(workflows\/(test|quality-checks)\.yml|actions\/)|^scripts\/(ci-plan|test-affected)\.mjs$/;

/** Inputs of the image the gate's `docker` leg builds and smoke-tests. */
export const DOCKER_FILES =
  /^(Dockerfile|\.dockerignore|docker-compose\.yml|scripts\/docker-smoke\.mjs)$/;

/** Inputs of `npm run build:tsc6` beyond source code. */
export const TSC6_FILES = /(^|\/)(package\.json|tsconfig[^/]*\.json)$|^package-lock\.json$|^\.nvmrc$/;

/** Web files whose change can alter any test, not just the ones importing them. */
const WEB_GLOBAL = /^web\/src\/(setupTests\.ts$|__mocks__\/)/;

const NODES_SHARD = new Set([
  "@nodetool-ai/gpu",
  "@nodetool-ai/workflow-runner",
  "@nodetool-ai/nodes-utils"
]);

/**
 * The `test-packages-*` leg that tests a workspace, or null for one no
 * backend shard covers. Mirrors the shards' turbo filters in
 * quality-checks.yml; scripts/__tests__/test-packages-shards.test.mjs holds
 * the two in step.
 */
export function shardOf(name, dir) {
  if (!dir.startsWith("packages/") && !dir.startsWith("reliability/")) return null;
  if (name === "@nodetool-ai/websocket") return "test-packages-websocket";
  if (name === "@nodetool-ai/agents") return "test-packages-agents";
  if (/^packages\/[^/]+-nodes$/.test(dir) || NODES_SHARD.has(name)) return "test-packages-nodes";
  return "test-packages-core";
}

/** Every leg on. Used for scheduled runs and as the fail-safe. */
export function fullCiPlan() {
  return {
    full: true,
    web: "full",
    electron: true,
    mobile: true,
    packages_websocket: true,
    packages_agents: true,
    packages_nodes: true,
    packages_core: true,
    integration: true,
    workflow_runner_e2e: true,
    tsc6: true,
    docker: true
  };
}

/**
 * Decide the CI legs for a list of changed files. Pure: the package graph and
 * `computeAffected` are passed in, as for `buildPlan`.
 */
export function buildCiPlan(files, packages, computeAffected) {
  const docker = files.some((f) => DOCKER_FILES.test(f));
  if (files.some((f) => GATE_FILES.test(f))) return { ...fullCiPlan(), docker };

  const plan = buildPlan(files, packages, computeAffected);
  if (plan.globalFiles.length > 0) return { ...fullCiPlan(), docker };

  const { affected } = computeAffected(files, packages);
  const byName = new Map(packages.map((p) => [p.name, p]));
  const dirOf = (name) => byName.get(name)?.dir ?? "";
  const appStep = (dir) => plan.steps.find((s) => s.label.startsWith(`${dir}:`));

  const shards = new Set(affected.map((name) => shardOf(name, dirOf(name))));

  const webStep = appStep("web");
  const webOwnOnly =
    webStep !== undefined &&
    webStep.args.includes("--findRelatedTests") &&
    files.every((f) => !f.startsWith("web/") || (f.startsWith("web/src/") && !WEB_GLOBAL.test(f)));

  return {
    full: false,
    web: webStep === undefined ? "none" : webOwnOnly ? "related" : "full",
    electron: appStep("electron") !== undefined,
    mobile: appStep("mobile") !== undefined,
    packages_websocket: shards.has("test-packages-websocket"),
    packages_agents: shards.has("test-packages-agents"),
    packages_nodes: shards.has("test-packages-nodes"),
    packages_core: shards.has("test-packages-core"),
    integration: affected.includes("@nodetool-ai/base-nodes"),
    workflow_runner_e2e: affected.includes("@nodetool-ai/workflow-runner"),
    tsc6: files.some((f) => TSC6_FILES.test(f)),
    docker
  };
}

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

/** The diff `base..head`, fetching `base` first when a shallow clone lacks it. */
function diffFiles(base, head) {
  if (!/^[0-9a-f]{40}$/.test(base)) throw new Error(`--base must be a full SHA, got "${base}"`);
  try {
    git(["cat-file", "-e", `${base}^{commit}`]);
  } catch {
    git(["fetch", "--no-tags", "--depth=1", "origin", base]);
  }
  return git(["diff", "--name-only", "--no-renames", base, head])
    .split("\n")
    .filter(Boolean);
}

function option(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] || undefined : undefined;
}

async function loadAffected() {
  return import(pathToFileURL(join(repoRoot, "packages/cli/src/affected/affected.ts")).href);
}

async function main(argv) {
  const [mode, ...rest] = argv;
  const base = option(rest, "--base");
  const head = option(rest, "--head") ?? "HEAD";
  const { computeAffected, EXTRA_WORKSPACE_PATHS } = await loadAffected();
  const packages = readPackages(EXTRA_WORKSPACE_PATHS);
  const files = base ? diffFiles(base, head) : null;

  if (mode === "plan") {
    const plan = files === null ? fullCiPlan() : buildCiPlan(files, packages, computeAffected);
    const json = JSON.stringify(plan);
    console.log(files === null ? "No base: full run." : `${files.length} changed file(s) vs ${base}.`);
    console.log(JSON.stringify(plan, null, 2));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `plan=${json}\n`);
    return 0;
  }

  if (mode === "run") {
    const apps = rest.filter((a, i) => !a.startsWith("--") && !rest[i - 1]?.startsWith("--"));
    const unknown = apps.filter((a) => !(a in APPS));
    if (apps.length === 0 || unknown.length > 0) {
      console.error(`run needs app names from: ${Object.keys(APPS).join(", ")}`);
      return 2;
    }
    const steps =
      files === null ? fullPlan() : buildPlan(files, packages, computeAffected).steps;
    for (const app of apps) {
      const step =
        steps.find((s) => s.label === app || s.label.startsWith(`${app}:`));
      if (!step) {
        console.log(`${app}: not affected by this diff.`);
        continue;
      }
      console.log(`\n${step.label}`);
      const { status } = spawnSync(step.command, step.args, { cwd: repoRoot, stdio: "inherit" });
      if (status !== 0) return status ?? 1;
    }
    return 0;
  }

  console.error("Usage: node scripts/ci-plan.mjs <plan|run> [apps...] [--base <sha>] [--head <sha>]");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}
