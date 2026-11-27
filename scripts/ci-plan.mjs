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
 *   - the macOS node catalog check runs when the diff reaches a pack the
 *     generator imports, node-sdk, the catalog package or the generator;
 *   - a backend shard runs when the diff affects a package in its slice, with
 *     turbo's `--affected` only when every changed file sits in a workspace
 *     directory (`turbo_affected`), since turbo cannot attribute any other
 *     file to a package;
 *   - web runs `--findRelatedTests` when only files under `web/src` changed,
 *     and its whole suite (sharded by the caller) when a package it depends on
 *     changed;
 *   - electron and mobile run the step `buildPlan` chose for them, through
 *     `run`;
 *   - the `typecheck` leg runs when the diff reaches a workspace or a file
 *     outside `TYPECHECK_FREE`, which none of its steps read;
 *   - the `harness-gate` leg runs when `nodetool harness gate` would run a
 *     selfcheck or fail on the diff (`harnessGateNeeded`);
 *   - the `build` job runs only when a leg that downloads its dist runs.
 *
 * Usage:
 *   node scripts/ci-plan.mjs plan [--base <sha>] [--head <sha>]
 *     Print the plan as JSON and, under GitHub Actions, write it to
 *     $GITHUB_OUTPUT as `plan`. No `--base` means a full run.
 *   node scripts/ci-plan.mjs run <web|electron|mobile...> [--base <sha>] [-- <args>]
 *     Run the test step the plan chose for each app, in order. Arguments
 *     after `--` are appended to each step, as in `-- --shard=1/3`.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CATALOG_PACKS } from "./node-catalog/packs.mjs";
import { APPS, DOC_ONLY, buildPlan, fullPlan, readPackages } from "./test-affected.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Files that define the gate itself. A change here runs every leg. */
export const GATE_FILES =
  /^\.github\/(workflows\/(test|quality-checks)\.yml|actions\/)|^scripts\/(ci-plan|test-affected)\.mjs$/;

/**
 * Inputs of the image the gate's `docker` leg builds and smoke-tests: the
 * image's own files plus the manifests, lockfile, build configs and bundler
 * scripts the Dockerfile copies. Package source is left out so ordinary code
 * changes do not trigger an image build.
 */
export const DOCKER_FILES =
  /^(Dockerfile|\.dockerignore|docker-compose\.yml|package(-lock)?\.json|(packages|reliability)\/[^/]+\/package\.json|web\/package\.json|electron\/scripts\/rebuild-native\.mjs|tsconfig[^/]*\.json|turbo\.json|scripts\/(docker-smoke|bundle-backend|backend-server-build-options|verify-backend-bundle)\.mjs)$/;

/** Inputs of `npm run build:tsc6` beyond source code. */
export const TSC6_FILES = /(^|\/)(package\.json|tsconfig[^/]*\.json)$|^package-lock\.json$|^\.nvmrc$/;

/**
 * The Blender integration suites render real scenes and take most of the
 * nodes leg. They run when blender-nodes itself changes and in the full
 * nightly run; elsewhere the leg skips installing Blender and they skip.
 */
export const BLENDER_FILES = /^packages\/blender-nodes\//;

/** The catalog generator's own files. PATH_CHECKS keeps them out of the global set. */
export const NODE_CATALOG_FILES = /^scripts\/(node-catalog\/|generate-node-catalog\.mjs$)/;

/**
 * Packages whose code the generator loads: the packs it imports to read their
 * registrations, the registry they register into, and the catalog package
 * that holds the checked-in data. A change to one of them or to a package it
 * depends on can alter the bytes `npm run check:node-catalog` compares.
 */
export const NODE_CATALOG_PACKAGES = new Set([
  ...CATALOG_PACKS.filter((pack) => pack.kind !== "cli-feature").map((pack) => pack.npmName),
  "@nodetool-ai/node-sdk",
  "@nodetool-ai/node-catalog"
]);

/**
 * Manifests the generator reads without importing the package: every pack's,
 * for its version and dependencies, and the CLI's, for the core version.
 */
export const NODE_CATALOG_MANIFESTS = new Set(
  [...CATALOG_PACKS.map((pack) => pack.npmName), "@nodetool-ai/cli"].map(
    (name) => `packages/${name.slice("@nodetool-ai/".length)}/package.json`
  )
);

/**
 * Whether the diff can change the generated catalog. The Linux check runs in
 * the `typecheck` leg of every run. This decides the macOS copy, which is
 * skipped only when the diff reaches none of the generator's inputs, so the
 * bytes it would compare are those of the last run that did.
 */
export function reachesNodeCatalog(files, affected) {
  return (
    files.some((f) => NODE_CATALOG_FILES.test(f) || NODE_CATALOG_MANIFESTS.has(f)) ||
    affected.some((name) => NODE_CATALOG_PACKAGES.has(name))
  );
}

/**
 * Files outside every workspace that no step of the `typecheck` leg reads:
 * native code (its own workflows build it), the marketing site, the
 * engineering skills, the Python fine-tuning scripts, the backlog lint
 * configs (the `lint` leg reads them) and the scripts' own suites (the
 * harness gate's `repo-scripts` selfcheck runs them). A diff of only these
 * files and prose reaches no workspace and skips the leg.
 */
export const TYPECHECK_FREE =
  /^(native\/|marketing\/|\.agents\/|scripts\/finetune\/|scripts\/__tests__\/|scripts\/crap-score\.mjs$|\.oxlintrc\.anti-slop(-enforced)?\.json$)/;

/** The capability table the harness gate compares against the base. */
const CAPABILITY_TABLE = "packages/cli-harness/src/harness/capability-table.ts";

/**
 * Whether `nodetool harness gate --base <base>` has anything to do for this
 * diff: a cheap, non-suite-only selfcheck to run, a changed code file no
 * surface claims (the gate fails on it), or a changed capability table (the
 * gate checks its mapping). Without one of them the gate prints an empty plan
 * and passes, so its leg would hold a runner for install and dist download
 * alone. Conservative where the gate is finer: it ignores the gate's pruning
 * of suites the test legs already run and its existence check on deleted
 * files, so it may start a gate that then runs nothing, never the reverse.
 * `registry` is `packages/cli-harness/src/harness/registry.ts` and
 * `changedFiles` its `changed-files.ts`, passed in to keep this pure.
 */
export function harnessGateNeeded(files, registry, changedFiles) {
  if (files.includes(CAPABILITY_TABLE)) return true;
  const gate = registry.planGate(files);
  if (gate.globalFiles.length > 0) return true;
  if (gate.checks.some((c) => c.cost === "cheap" && !c.suiteOnly)) return true;
  return gate.unmappedFiles.some(
    (f) => changedFiles.isGateRelevantCodeFile(f) && !registry.isUnclaimedPath(f)
  );
}

const LOCKFILE = "package-lock.json";

/** Dependency fields an npm v3 lockfile entry may list. */
const LOCK_DEP_FIELDS = ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"];

/**
 * The lockfile key npm installs `name` at for the entry at `from`: the
 * nearest `node_modules/<name>` walking up from `from`, as Node resolves it.
 */
function resolveLockKey(lock, from, name) {
  let base = from;
  for (;;) {
    const key = base ? `${base}/node_modules/${name}` : `node_modules/${name}`;
    if (lock[key]) return key;
    if (!base) return null;
    const i = base.lastIndexOf("node_modules/");
    base = i < 0 ? "" : base.slice(0, i).replace(/\/$/, "");
  }
}

/** Whether the installed tree under `start` holds a key in `changed`. */
function lockTreeTouches(lock, start, changed, workspaceDirs) {
  const seen = new Set();
  const queue = [start];
  while (queue.length > 0) {
    const key = queue.pop();
    if (seen.has(key)) continue;
    seen.add(key);
    if (changed.has(key)) return true;
    let entry = lock[key];
    if (entry?.link) {
      // Another workspace: the package graph carries its dependents.
      if (workspaceDirs.has(entry.resolved)) continue;
      queue.push(entry.resolved);
      continue;
    }
    for (const field of LOCK_DEP_FIELDS) {
      for (const name of Object.keys(entry?.[field] ?? {})) {
        const dep = resolveLockKey(lock, key, name);
        if (dep !== null) queue.push(dep);
      }
    }
  }
  return false;
}

/**
 * The workspaces whose installed dependency tree a `package-lock.json`
 * change reaches, so a dependency bump runs the legs of the packages that
 * install it instead of every leg. Compares each lockfile entry before and
 * after, then walks every workspace's tree in both lockfiles. Returns null,
 * which keeps the lockfile global, when either side is unreadable or the
 * change reaches the root's own dependencies: the root dev tools (vitest,
 * turbo, typescript, oxlint) run every suite without the packages declaring
 * them. `check-workspace-deps` keeps each workspace's imports declared, which
 * is what lets a walk of its declared tree stand for what it loads.
 */
export function lockfileWorkspaces(before, after, workspaceDirs) {
  const a = before?.packages;
  const b = after?.packages;
  if (!a || !b) return null;
  const dirs = new Set(workspaceDirs);
  const changed = new Set();
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) changed.add(key);
  }
  if (lockTreeTouches(a, "", changed, dirs) || lockTreeTouches(b, "", changed, dirs)) return null;
  return workspaceDirs.filter(
    (dir) => lockTreeTouches(a, dir, changed, dirs) || lockTreeTouches(b, dir, changed, dirs)
  );
}

/** Web files whose change can alter any test, not just the ones importing them. */
const WEB_GLOBAL = /^web\/src\/(setupTests\.ts$|__mocks__\/)/;

/**
 * Suites whose game scripts run against a 50 ms wall-clock batch budget. Their
 * shard runs one package and one test file at a time, so they get a runner of
 * their own instead of the head of the core shard.
 */
const GAME_SHARD = new Set([
  "@nodetool-ai/game-runtime",
  "@nodetool-ai/game-renderer",
  "@nodetool-ai/cli-game"
]);

const NODES_SHARD = new Set([
  "@nodetool-ai/gpu",
  "@nodetool-ai/workflow-runner",
  "@nodetool-ai/nodes-utils"
]);

/**
 * The execution packages with the longest suites of the former `core` shard.
 * `core` ran them, the CLI packages and everything else two at a time on one
 * runner and took about twice as long as any other leg. They are a positive
 * list: a new package lands in `core` until someone moves it here.
 */
const ENGINE_SHARD = new Set([
  "@nodetool-ai/runtime",
  "@nodetool-ai/models",
  "@nodetool-ai/execution",
  "@nodetool-ai/kernel",
  "@nodetool-ai/node-sdk",
  "@nodetool-ai/protocol"
]);

/** `packages/cli` and `packages/cli-*`, as the `cli` shard's turbo filters name them. */
const CLI_DIR = /^packages\/cli(-[^/]+)?$/;

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
  if (GAME_SHARD.has(name)) return "test-packages-game";
  if (/^packages\/[^/]+-nodes$/.test(dir) || NODES_SHARD.has(name)) return "test-packages-nodes";
  if (ENGINE_SHARD.has(name)) return "test-packages-engine";
  if (CLI_DIR.test(dir) || dir.startsWith("reliability/")) return "test-packages-cli";
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
    packages_cli: true,
    packages_engine: true,
    packages_game: true,
    integration: true,
    workflow_runner_e2e: true,
    tsc6: true,
    docker: true,
    blender: true,
    node_catalog: true,
    typecheck: true,
    harness_gate: true,
    turbo_affected: false
  };
}

/**
 * Legs a pull request leaves to the merge queue once branch protection merges
 * through one (`vars.MERGE_QUEUE`, see test.yml). The `merge_group` run plans
 * them from a diff that contains the PR's changes, so each one still gates the
 * merge; the PR just stops paying for them on every push. These are slow or macOS-only legs whose
 * failure blocks the merge from the queue instead of from the PR.
 */
export const QUEUE_ONLY_LEGS = ["integration", "workflow_runner_e2e", "tsc6", "docker", "node_catalog"];

/** A pull request's plan with the queue-only legs off, and which ones were on. */
export function deferToQueue(plan) {
  const deferred = QUEUE_ONLY_LEGS.filter((leg) => plan[leg] === true);
  return {
    ...plan,
    ...Object.fromEntries(QUEUE_ONLY_LEGS.map((leg) => [leg, false])),
    deferred_to_queue: deferred
  };
}

/**
 * Decide the CI legs for a list of changed files. Pure: the package graph,
 * `computeAffected` and the harness gate predicate are passed in, as for
 * `buildPlan`. Without `gateNeeded` the harness gate always runs.
 */
export function buildCiPlan(files, packages, computeAffected, gateNeeded = () => true, lockDirs = null) {
  const docker = files.some((f) => DOCKER_FILES.test(f));
  const tsc6 = files.some((f) => TSC6_FILES.test(f));
  const harness_gate = gateNeeded(files);
  if (files.some((f) => GATE_FILES.test(f))) return { ...fullCiPlan(), docker, harness_gate };

  // A lockfile change stands for the workspaces whose tree it reaches
  // (`lockfileWorkspaces`). Without that list it stays a global file.
  const lockScoped = lockDirs !== null && files.includes(LOCKFILE);
  const scoped = lockScoped ? [...files.filter((f) => f !== LOCKFILE), ...lockDirs] : files;

  const plan = buildPlan(scoped, packages, computeAffected);
  if (plan.globalFiles.length > 0) return { ...fullCiPlan(), docker, harness_gate };

  // Turbo's `--affected` maps a changed file to the workspace whose directory
  // holds it, and a file in no workspace directory to the root, which no
  // package depends on. A file another workspace owns through
  // EXTRA_WORKSPACE_PATHS (shipped skills, sandbox packs, journeys) therefore
  // selects no test task under `--affected`, so the shards run without it and
  // the task hashes decide what reruns. Markdown in such a path counts too: a
  // sandbox pack's SKILL.md is parsed by node-sdk, even though DOC_ONLY reads
  // it as prose.
  const under = (f, dir) => f === dir || f.startsWith(`${dir}/`);
  const outsideWorkspaces = scoped.some(
    (f) =>
      !packages.some((p) => under(f, p.dir)) &&
      (!DOC_ONLY.test(f) || packages.some((p) => p.ownedPaths?.some((dir) => under(f, dir))))
  );

  const { affected } = computeAffected(scoped, packages);
  const byName = new Map(packages.map((p) => [p.name, p]));
  const dirOf = (name) => byName.get(name)?.dir ?? "";
  const appStep = (dir) => plan.steps.find((s) => s.label.startsWith(`${dir}:`));

  const shards = new Set(affected.map((name) => shardOf(name, dirOf(name))));

  const webStep = appStep("web");
  const webOwnOnly =
    webStep !== undefined &&
    webStep.args.includes("--findRelatedTests") &&
    scoped.every((f) => !f.startsWith("web/") || (f.startsWith("web/src/") && !WEB_GLOBAL.test(f)));

  return {
    full: false,
    web: webStep === undefined ? "none" : webOwnOnly ? "related" : "full",
    electron: appStep("electron") !== undefined,
    mobile: appStep("mobile") !== undefined,
    packages_websocket: shards.has("test-packages-websocket"),
    packages_agents: shards.has("test-packages-agents"),
    packages_nodes: shards.has("test-packages-nodes"),
    packages_core: shards.has("test-packages-core"),
    packages_cli: shards.has("test-packages-cli"),
    packages_engine: shards.has("test-packages-engine"),
    packages_game: shards.has("test-packages-game"),
    integration: affected.includes("@nodetool-ai/base-nodes"),
    workflow_runner_e2e: affected.includes("@nodetool-ai/workflow-runner"),
    tsc6,
    docker,
    blender: scoped.some((f) => BLENDER_FILES.test(f)),
    node_catalog: reachesNodeCatalog(scoped, affected),
    typecheck:
      affected.length > 0 || scoped.some((f) => !DOC_ONLY.test(f) && !TYPECHECK_FREE.test(f)),
    harness_gate,
    // Turbo reads a lockfile change on its own terms, so the shards the
    // lockfile selected run their whole slice.
    turbo_affected: !outsideWorkspaces && !lockScoped
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

/** `lockfileWorkspaces` for the diff, or null (lockfile stays global) on any error. */
function readLockfileWorkspaces(base, head, packages) {
  try {
    const read = (ref) => JSON.parse(execFileSync("git", ["show", `${ref}:${LOCKFILE}`], { cwd: repoRoot, encoding: "utf8", maxBuffer: 1 << 28 }));
    const dirs = lockfileWorkspaces(read(base), read(head), packages.map((p) => p.dir).filter((d) => d !== "mobile"));
    console.log(dirs === null ? "Lockfile change reaches the root's dependencies: global." : `Lockfile change reaches: ${dirs.join(", ") || "no workspace"}.`);
    return dirs;
  } catch (error) {
    console.log(`Lockfile comparison failed (${error.message}): global.`);
    return null;
  }
}

function option(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] || undefined : undefined;
}

async function loadAffected() {
  return import(pathToFileURL(join(repoRoot, "packages/cli-harness/src/affected/affected.ts")).href);
}

/**
 * The harness registry, loaded from source with Node's type stripping. Its
 * relative imports name the compiled `.js` files, so a resolve hook maps them
 * to the `.ts` sources beside them: the `changes` job has no install or build.
 */
async function loadGateNeeded() {
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
        const source = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
        if (existsSync(fileURLToPath(source))) return next(source.href, context);
      }
      return next(specifier, context);
    }
  });
  const dir = join(repoRoot, "packages/cli-harness/src/harness");
  const registry = await import(pathToFileURL(join(dir, "registry.ts")).href);
  const changedFiles = await import(pathToFileURL(join(dir, "changed-files.ts")).href);
  return (files) => harnessGateNeeded(files, registry, changedFiles);
}

async function main(argv) {
  const [mode, ...rest] = argv;
  const base = option(rest, "--base");
  const head = option(rest, "--head") ?? "HEAD";
  const { computeAffected, EXTRA_WORKSPACE_PATHS } = await loadAffected();
  const packages = readPackages(EXTRA_WORKSPACE_PATHS);
  const files = base ? diffFiles(base, head) : null;
  const lockDirs = files?.includes(LOCKFILE) ? readLockfileWorkspaces(base, head, packages) : null;

  if (mode === "plan") {
    const planned =
      files === null
        ? fullCiPlan()
        : buildCiPlan(files, packages, computeAffected, await loadGateNeeded(), lockDirs);
    const plan = rest.includes("--defer-to-queue") ? deferToQueue(planned) : planned;
    const json = JSON.stringify(plan);
    console.log(files === null ? "No base: full run." : `${files.length} changed file(s) vs ${base}.`);
    console.log(JSON.stringify(plan, null, 2));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `plan=${json}\n`);
    return 0;
  }

  if (mode === "run") {
    const separator = rest.indexOf("--");
    const own = separator < 0 ? rest : rest.slice(0, separator);
    const extra = separator < 0 ? [] : rest.slice(separator + 1);
    const apps = own.filter((a, i) => !a.startsWith("--") && !own[i - 1]?.startsWith("--"));
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
      // A full-suite step has no `--` of its own. npm needs one before
      // arguments meant for the test runner.
      const args =
        extra.length === 0 ? step.args : [...step.args, ...(step.args.includes("--") ? [] : ["--"]), ...extra];
      const { status } = spawnSync(step.command, args, { cwd: repoRoot, stdio: "inherit" });
      if (status !== 0) return status ?? 1;
    }
    return 0;
  }

  console.error("Usage: node scripts/ci-plan.mjs <plan|run> [apps...] [--base <sha>] [--head <sha>] [--defer-to-queue] [-- <test args>]");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}
