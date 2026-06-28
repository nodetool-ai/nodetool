/**
 * Maps a set of changed files to the minimal set of workspaces a coding agent
 * needs to rebuild / typecheck / test — and the exact commands to do it.
 *
 * The monorepo build is dependency-ordered and slow (1–2 min full). Most edits
 * touch one package; this works out the downstream closure of dependents so an
 * agent runs `--workspace=<pkg>` checks instead of the whole tree, and only
 * triggers `npm run build:packages` when a decorator package (which loads from
 * dist/) is in the affected set.
 *
 * Pure and registry-free so it can be unit-tested with a synthetic graph.
 */

/** Packages whose nodes load from compiled dist/ (decorators) — see CLAUDE.md. */
export const DECORATOR_PACKAGES: ReadonlySet<string> = new Set([
  "@nodetool-ai/node-sdk",
  "@nodetool-ai/base-nodes",
  "@nodetool-ai/fal-nodes",
  "@nodetool-ai/replicate-nodes",
  "@nodetool-ai/elevenlabs-nodes"
]);

export interface PackageInfo {
  /** Package name, e.g. "@nodetool-ai/cli". */
  name: string;
  /** Repo-relative directory, e.g. "packages/cli". */
  dir: string;
  /** Internal `@nodetool-ai/*` dependencies declared in package.json. */
  internalDeps: string[];
}

export interface AffectedResult {
  /** Workspaces directly containing a changed file. */
  changed: string[];
  /** `changed` plus every workspace that transitively depends on them. */
  affected: string[];
  /** Affected decorator packages — these force a `build:packages`. */
  needsBuild: string[];
  /** Changed files that mapped to no known workspace. */
  unmatched: string[];
  /** Suggested commands, ordered (build first, then per-workspace checks). */
  commands: string[];
}

/** Top-level non-package workspaces that consume packages but have no dependents. */
const TOP_LEVEL_WORKSPACES = ["web", "electron", "mobile"] as const;

function matchWorkspace(
  file: string,
  packages: ReadonlyArray<PackageInfo>
): string | null {
  const norm = file.replace(/^\.\//, "").replace(/\\/g, "/");
  // Most specific (longest dir) first so packages/foo-bar wins over packages/foo.
  const sorted = [...packages].sort((a, b) => b.dir.length - a.dir.length);
  for (const pkg of sorted) {
    if (norm === pkg.dir || norm.startsWith(pkg.dir + "/")) return pkg.name;
  }
  for (const top of TOP_LEVEL_WORKSPACES) {
    if (norm === top || norm.startsWith(top + "/")) return top;
  }
  return null;
}

function buildDependents(
  packages: ReadonlyArray<PackageInfo>
): Map<string, string[]> {
  const dependents = new Map<string, string[]>();
  for (const pkg of packages) {
    for (const dep of pkg.internalDeps) {
      const list = dependents.get(dep) ?? [];
      list.push(pkg.name);
      dependents.set(dep, list);
    }
  }
  return dependents;
}

export function computeAffected(
  changedFiles: ReadonlyArray<string>,
  packages: ReadonlyArray<PackageInfo>
): AffectedResult {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const dependents = buildDependents(packages);

  const changed = new Set<string>();
  const unmatched: string[] = [];
  for (const file of changedFiles) {
    const ws = matchWorkspace(file, packages);
    if (ws) changed.add(ws);
    else unmatched.push(file);
  }

  // Downstream closure: a change to X affects X and everything that depends on
  // X (transitively). Top-level workspaces (web/electron) have no dependents.
  const affected = new Set<string>(changed);
  const queue = [...changed];
  while (queue.length > 0) {
    const name = queue.shift()!;
    for (const dependent of dependents.get(name) ?? []) {
      if (!affected.has(dependent)) {
        affected.add(dependent);
        queue.push(dependent);
      }
    }
  }

  const affectedList = [...affected].sort();
  const needsBuild = affectedList.filter((n) => DECORATOR_PACKAGES.has(n));

  const commands: string[] = [];
  if (needsBuild.length > 0) {
    // build:packages is dependency-ordered; run the whole pass once.
    commands.push("npm run build:packages");
  }
  for (const name of affectedList) {
    if (TOP_LEVEL_WORKSPACES.includes(name as (typeof TOP_LEVEL_WORKSPACES)[number])) {
      commands.push(`cd ${name} && npm run typecheck && npm test`);
    } else {
      const pkg = byName.get(name);
      const dir = pkg?.dir ?? name;
      commands.push(`npm run test --workspace=${dir}`);
    }
  }

  return {
    changed: [...changed].sort(),
    affected: affectedList,
    needsBuild,
    unmatched,
    commands
  };
}
