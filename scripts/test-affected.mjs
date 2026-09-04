#!/usr/bin/env node
/**
 * `npm run test:affected` — run only the suites that depend on changed code.
 *
 * The full pass (`npm run test:packages && npm run test`) is minutes of wall
 * clock, and an agent about to commit a two-file change pays it in full. This
 * maps the diff onto workspaces with the same `computeAffected` behind
 * `nodetool affected` — the owning workspace plus its downstream closure — and
 * then runs, per target:
 *
 *   - backend packages: `turbo run test` filtered to the affected packages, so
 *     their dependencies still build (`test` dependsOn `^build`);
 *   - web/electron/mobile: `jest --findRelatedTests <changed files>` when only
 *     that app's own files changed, and the app's whole suite when a package it
 *     depends on changed — jest's dependency graph stops at the workspace root,
 *     so a change inside `node_modules/@nodetool-ai/*` is invisible to it;
 *   - everything, when a changed file belongs to no workspace and is not
 *     documentation (root configs, `scripts/`, the lockfile).
 *
 * Flags: `--base <ref>` (default: merge-base with origin/main, plus the working
 * tree), `--all` (skip selection), `--dry-run` (print the plan), `--gate`
 * (also print `nodetool harness gate`'s plan for the same changed files —
 * see AGENTS.md § Mandatory Post-Change Verification), or explicit file paths
 * to ask what a given change would select.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Apps whose tests are Jest suites rooted at their own directory, keyed by
 * repo-relative dir. Their package names are not their dirs (web is `nodetool`,
 * electron is `nodetool-electron`), so the names are read from disk.
 */
export const APPS = {
  web: ["npm", "test", "--workspace=web", "--"],
  electron: ["npm", "test", "--workspace=electron", "--"],
  mobile: ["npm", "--prefix", "mobile", "test", "--"]
};

/**
 * Mobile is deliberately not a root workspace (see the pitfalls in AGENTS.md),
 * so its dependency on NodeTool packages is absent from its package.json:
 * metro, tsconfig and jest compile `@nodetool-ai/app-runtime` from source, and
 * protocol is built before its typecheck.
 */
export const MOBILE_DEPS = ["@nodetool-ai/protocol", "@nodetool-ai/app-runtime"];

/** Changed files that cannot change the outcome of a test run. */
export const DOC_ONLY =
  /(^|\/)[^/]+\.mdx?$|^docs\/|^\.github\/|^\.claude\/|^\.vscode\/|^LICENSE$|^\.gitignore$/;

function abbreviate(names, limit) {
  const head = names.slice(0, limit).join(", ");
  return names.length > limit ? `${head} +${names.length - limit} more` : head;
}

/** Every internal package a workspace depends on, transitively. */
function depClosure(name, byName) {
  const seen = new Set();
  const queue = [...(byName.get(name)?.internalDeps ?? [])];
  while (queue.length > 0) {
    const dep = queue.shift();
    if (seen.has(dep)) continue;
    seen.add(dep);
    queue.push(...(byName.get(dep)?.internalDeps ?? []));
  }
  return seen;
}

/** The full pass, as the steps a plan is made of. */
export function fullPlan() {
  return [
    { label: "packages", command: "npm", args: ["run", "test:packages"] },
    ...Object.entries(APPS).map(([dir, cmd]) => ({
      label: dir,
      command: cmd[0],
      args: cmd.slice(1, -1)
    }))
  ];
}

/**
 * Decide what to run for a set of changed files. Pure: `computeAffected` is
 * passed in so this can be unit-tested against a synthetic package graph.
 */
export function buildPlan(files, packages, computeAffected) {
  const result = computeAffected(files, packages);
  const globalFiles = result.unmatched.filter((f) => !DOC_ONLY.test(f));
  if (globalFiles.length > 0) return { steps: fullPlan(), globalFiles };

  const byName = new Map(packages.map((p) => [p.name, p]));
  const byDir = new Map(packages.map((p) => [p.dir, p]));
  /** App dir → package name, e.g. "web" → "nodetool". */
  const appPkg = new Map(
    Object.keys(APPS).map((dir) => [dir, byDir.get(dir)?.name ?? dir])
  );
  const appNames = new Set(appPkg.values());

  const steps = [];
  const backend = result.affected.filter((n) => !appNames.has(n));
  if (backend.length > 0) {
    steps.push({
      label: `packages (${backend.length}): ${abbreviate(backend, 6)}`,
      command: "npx",
      args: ["turbo", "run", "test", ...backend.map((n) => `--filter=${n}`)]
    });
  }

  for (const [dir, name] of appPkg) {
    if (!result.affected.includes(name)) continue;
    const upstream = [...depClosure(name, byName)].filter((d) =>
      result.affected.includes(d)
    );
    const own = files.filter((f) => f === dir || f.startsWith(`${dir}/`));
    if (upstream.length > 0 || own.length === 0) {
      const why =
        upstream.length > 0
          ? `depends on ${abbreviate(upstream, 3)}`
          : "no own files changed";
      steps.push({
        label: `${dir}: full suite (${why})`,
        command: APPS[dir][0],
        args: APPS[dir].slice(1, -1)
      });
    } else {
      steps.push({
        label: `${dir}: tests related to ${own.length} changed file(s)`,
        command: APPS[dir][0],
        args: [
          ...APPS[dir].slice(1),
          "--findRelatedTests",
          ...own.map((f) => join(repoRoot, f)),
          "--passWithNoTests"
        ]
      });
    }
  }
  return { steps, globalFiles: [] };
}

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    // Not a repo, or the ref does not exist — callers fall back.
    return null;
  }
}

function gitLines(args) {
  const out = git(args);
  return out === null ? [] : out.split("\n").filter(Boolean);
}

function resolveBase(baseArg) {
  for (const ref of baseArg ? [baseArg] : ["origin/main", "main"]) {
    if (git(["rev-parse", "--verify", "--quiet", ref]) === null) continue;
    const mergeBase = git(["merge-base", "HEAD", ref]);
    if (mergeBase) return mergeBase.trim();
  }
  return null;
}

function changedFiles(baseArg) {
  const files = new Set([
    ...gitLines(["diff", "--name-only", "HEAD"]),
    ...gitLines(["ls-files", "--others", "--exclude-standard"])
  ]);
  const base = resolveBase(baseArg);
  if (base) {
    for (const f of gitLines(["diff", "--name-only", `${base}..HEAD`])) {
      files.add(f);
    }
  } else if (baseArg) {
    console.error(`Cannot resolve --base ${baseArg}; using the working tree.`);
  }
  return { files: [...files].sort(), base };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readPackages(extraWorkspacePaths) {
  // Workspaces come from the root package.json, not a scan of packages/ —
  // reliability/harness is a workspace too.
  const rootPkg = readJson(join(repoRoot, "package.json"));
  const packages = [];
  for (const dir of rootPkg.workspaces ?? []) {
    const manifest = join(repoRoot, dir, "package.json");
    if (!existsSync(manifest)) continue;
    const pkg = readJson(manifest);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    packages.push({
      name: pkg.name,
      dir,
      internalDeps: Object.keys(deps).filter((d) =>
        d.startsWith("@nodetool-ai/")
      ),
      ownedPaths: extraWorkspacePaths[pkg.name]
    });
  }
  packages.push({ name: "mobile", dir: "mobile", internalDeps: MOBILE_DEPS });
  return packages;
}

/**
 * The argv for `npm run dev:nodetool -- harness gate --dry-run <files...>`,
 * asking the harness registry what it would run over the same changed files
 * `test:affected` just selected suites for. Pure so the shape is unit-testable
 * without shelling out.
 */
export function buildGateArgv(files) {
  return ["run", "dev:nodetool", "--", "harness", "gate", "--dry-run", ...files];
}

function run(command, args) {
  const bin =
    process.platform === "win32" && (command === "npm" || command === "npx")
      ? `${command}.cmd`
      : command;
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(bin, args, { cwd: repoRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      "Usage: npm run test:affected -- [files...] [--base <ref>] [--all] [--dry-run] [--gate]"
    );
    return 0;
  }
  const dryRun = argv.includes("--dry-run");
  const gate = argv.includes("--gate");
  const baseIndex = argv.indexOf("--base");
  const baseArg = baseIndex >= 0 ? argv[baseIndex + 1] : undefined;
  const explicit = argv.filter(
    (a, i) => !a.startsWith("-") && (baseIndex < 0 || i !== baseIndex + 1)
  );

  // The mapping module is pure and imports nothing; Node strips its types, so
  // this reuses the harness logic instead of copying it.
  const { computeAffected, EXTRA_WORKSPACE_PATHS } = await import(
    pathToFileURL(join(repoRoot, "packages/cli/src/affected/affected.ts")).href
  );

  let steps;
  let reason;
  let gateFiles = [];
  if (argv.includes("--all")) {
    steps = fullPlan();
    reason = "--all";
  } else {
    const { files, base } = explicit.length
      ? { files: [...explicit].sort(), base: null }
      : changedFiles(baseArg);
    if (files.length === 0) {
      console.log("No changed files — nothing to test.");
      return 0;
    }
    gateFiles = files;
    reason = explicit.length
      ? `${files.length} file(s) given on the command line`
      : base
        ? `${files.length} changed file(s) vs ${base.slice(0, 12)} + working tree`
        : `${files.length} changed file(s) in the working tree`;

    const plan = buildPlan(files, readPackages(EXTRA_WORKSPACE_PATHS), computeAffected);
    if (plan.globalFiles.length > 0) {
      console.log(
        `Changed files outside every workspace — running everything:\n  ${plan.globalFiles.join("\n  ")}`
      );
    }
    steps = plan.steps;
  }

  console.log(`\nAffected test plan (${reason}):`);
  if (steps.length === 0) {
    console.log("  nothing — no workspace owns the changed files.");
  } else {
    for (const step of steps) console.log(`  - ${step.label}`);
  }

  // `--gate` is a separate, opt-in report: what `nodetool harness gate` would
  // run over the same changed files. It shells out (`--dry-run`, so nothing
  // actually runs) rather than duplicating the registry's selection logic.
  if (gate && gateFiles.length > 0) {
    console.log("\nHarness gate plan for the same diff:");
    run("npm", buildGateArgv(gateFiles));
  }

  if (steps.length === 0 || dryRun) return 0;

  for (const step of steps) {
    const status = run(step.command, step.args);
    if (status !== 0) {
      console.error(`\nFailed: ${step.label}`);
      return status;
    }
  }
  console.log("\nAll affected suites passed.");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}
