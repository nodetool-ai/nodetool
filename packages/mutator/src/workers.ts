/**
 * Worker overlays, the way unclebob/mutator runs mutants in parallel.
 *
 * Each worker is a directory under `target/mutation-workers`. Every directory
 * on the way down to the package that owns the mutated file is real, and its
 * siblings are symlinks into the project. The package itself is a private
 * copy, with its heavy directories (`node_modules`, `dist`, …) linked.
 *
 * mutator copies the mutated file and every module that reaches it through a
 * relative import, because Node and Vite resolve a relative import from a
 * module's real path, so a symlinked importer would load the original. A
 * TypeScript package is small next to its dependencies, so the whole package
 * is copied instead: every relative import then stays inside the copy, with
 * no import scanner to get wrong. The original tree is never written.
 */

import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync
} from "node:fs";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";

/** Never linked or copied into a worker. `target` holds the workers themselves. */
export const SKIP = new Set([".git", ".hg", ".svn", "target", ".metrics"]);

/** Linked, not copied, inside the package copy. */
export const LINKED = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "reports",
  ".turbo",
  ".vite",
  ".stryker-tmp"
]);

export function workersRoot(root: string): string {
  return join(root, "target", "mutation-workers");
}

/** The smaller of the sites, the cores, and an explicit --max-workers. */
export function workerCount(siteCount: number, requested: number | null, cores = availableParallelism()): number {
  const limit = requested ?? cores;
  return Math.max(1, Math.min(siteCount, cores, limit));
}

function link(destination: string, target: string): void {
  symlinkSync(realpathSync(target), destination);
}

function linkChildren(workerDir: string, realDir: string, except: string | null): void {
  for (const name of readdirSync(realDir)) {
    if (name === except || SKIP.has(name)) {
      continue;
    }
    link(join(workerDir, name), join(realDir, name));
  }
}

function copyTree(destination: string, source: string): void {
  mkdirSync(destination, { recursive: true });
  for (const name of readdirSync(source)) {
    if (SKIP.has(name)) {
      continue;
    }
    const from = join(source, name);
    const to = join(destination, name);
    const stat = lstatSync(from);
    if (LINKED.has(name) || stat.isSymbolicLink()) {
      if (stat.isSymbolicLink() && !existsSync(from)) {
        symlinkSync(readlinkSync(from), to);
      } else {
        link(to, from);
      }
    } else if (stat.isDirectory()) {
      copyTree(to, from);
    } else if (stat.isFile()) {
      copyFileSync(from, to);
    }
  }
}

/**
 * Build one worker for the package at `unit` (relative to `root`, posix
 * separators). `unit` must not be the root itself.
 */
export function createWorker(worker: string, root: string, unit: string): void {
  const segments = unit.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error("a worker needs a package below the project root");
  }
  mkdirSync(worker, { recursive: true });
  let realDir = root;
  let workerDir = worker;
  for (const segment of segments.slice(0, -1)) {
    linkChildren(workerDir, realDir, segment);
    realDir = join(realDir, segment);
    workerDir = join(workerDir, segment);
    mkdirSync(workerDir);
  }
  const last = segments[segments.length - 1];
  linkChildren(workerDir, realDir, last);
  copyTree(join(workerDir, last), join(realDir, last));
}

/** Map a directory inside the real tree to the same place inside a worker. */
export function mappedPath(worker: string, root: string, path: string): string {
  const relativePath = resolve(path).slice(resolve(root).length);
  return join(worker, relativePath);
}

/** Workers per package, created on first use and removed by `dispose`. */
export class WorkerPool {
  private readonly runDir: string;
  private readonly byUnit = new Map<string, string[]>();

  constructor(private readonly root: string) {
    this.runDir = join(workersRoot(root), `run-${randomUUID()}`);
  }

  workers(unit: string, count: number): string[] {
    const existing = this.byUnit.get(unit) ?? [];
    for (let index = existing.length; index < count; index += 1) {
      const worker = join(this.runDir, `worker-${unit.replace(/[\\/]/g, "_")}-${index}`);
      createWorker(worker, this.root, unit);
      existing.push(worker);
    }
    this.byUnit.set(unit, existing);
    return existing.slice(0, count);
  }

  dispose(): void {
    rmSync(this.runDir, { recursive: true, force: true });
  }
}

/** Remove overlays an interrupted run left behind. `rm` does not follow links. */
export function removeStaleWorkers(root: string): void {
  rmSync(workersRoot(root), { recursive: true, force: true });
}
