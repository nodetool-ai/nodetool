/** Apply each selected mutant, run its tests, and record the snapshot. */

import { readFileSync, writeFileSync } from "node:fs";
import { formDigests, formKey, findForms, formSpans, sitesInFile } from "./forms.js";
import { describeSite, type FormResult, type Outcome, type Site, type Status } from "./model.js";
import { expandCommand, packageDirOf, relativeKey } from "./project.js";
import type { CommandRunner } from "./runner.js";
import { applySite } from "./sites.js";
import type { History, SnapshotStore } from "./snapshot.js";
import { mappedPath, workerCount, type WorkerPool } from "./workers.js";

export interface Baseline {
  ok: boolean;
  seconds: number;
  tail: string;
}

export interface EngineContext {
  root: string;
  runner: CommandRunner;
  store: SnapshotStore;
  pool: WorkerPool;
  /** Covered lines for an absolute path, `undefined` when the report has no entry, `null` to ignore coverage. */
  coveredLines: ((path: string) => Set<number> | undefined) | null;
  mutateAll: boolean;
  lines: Set<number> | null;
  /** Form keys to restrict the run to, from `--base`. */
  changedForms: ((path: string, source: string) => Set<string> | null) | null;
  testCommand: (packageDir: string) => string;
  timeoutFactor: number;
  mutationWarning: number;
  maxWorkers: number | null;
  baselines: Map<string, Baseline>;
  log: (message: string) => void;
}

export interface RunResult {
  path: string;
  forms: FormResult[];
  written: string[];
  sites: Site[];
  statuses: Map<string, Status>;
  baselineFailed: boolean;
  baselineMessage: string;
  skipped: string;
}

function emptyResult(path: string, extra: Partial<RunResult>): RunResult {
  return {
    path,
    forms: [],
    written: [],
    sites: [],
    statuses: new Map(),
    baselineFailed: false,
    baselineMessage: "",
    skipped: "",
    ...extra
  };
}

export function selectSites(
  sites: Site[],
  covered: Map<string, boolean>,
  history: History,
  digests: Map<string, string>,
  mutateAll: boolean,
  lines: Set<number> | null,
  changedForms: Set<string> | null
): Site[] {
  return sites.filter((site) => {
    if (!covered.get(site.mutationId)) {
      return false;
    }
    if (lines !== null && !lines.has(site.line)) {
      return false;
    }
    const key = formKey(site.namespace, site.formId);
    if (changedForms !== null && !changedForms.has(key)) {
      return false;
    }
    const prior = history.forms.get(key);
    const unchanged = prior !== undefined && prior === digests.get(key);
    if (mutateAll || !unchanged) {
      return true;
    }
    return history.outcomes.get(site.mutationId) !== "killed";
  });
}

/** Prior outcomes of sites whose function text did not change. */
export function carryForward(
  sites: Site[],
  covered: Map<string, boolean>,
  history: History,
  digests: Map<string, string>
): Map<string, Outcome> {
  const byId = new Map(sites.map((site) => [site.mutationId, site]));
  const carried = new Map<string, Outcome>();
  for (const [mutation, status] of history.outcomes) {
    const site = byId.get(mutation);
    if (site === undefined || !covered.get(mutation)) {
      continue;
    }
    const key = formKey(site.namespace, site.formId);
    const prior = history.forms.get(key);
    if (prior !== undefined && prior === digests.get(key)) {
      carried.set(mutation, status);
    }
  }
  return carried;
}

export function tallyForms(
  source: string,
  path: string,
  fileKey: string,
  sites: Site[],
  covered: Map<string, boolean>,
  outcomes: Map<string, Outcome>,
  lines: Set<number> | null
): FormResult[] {
  const forms = findForms(source, path, fileKey);
  const digests = formDigests(source, forms);
  const grouped = new Map<string, Site[]>();
  for (const site of sites) {
    const key = formKey(site.namespace, site.formId);
    grouped.set(key, [...(grouped.get(key) ?? []), site]);
  }
  return formSpans(forms).map((span) => {
    const key = formKey(span.namespace, span.id);
    const owned = grouped.get(key) ?? [];
    let killed = 0;
    let survived = 0;
    let uncovered = 0;
    for (const site of owned) {
      if (!covered.get(site.mutationId)) {
        uncovered += 1;
        continue;
      }
      const status = outcomes.get(site.mutationId);
      if (status === "killed") {
        killed += 1;
      } else if (status === "survived" || lines === null) {
        survived += 1;
      }
    }
    return {
      id: span.id,
      namespace: span.namespace,
      name: span.name,
      private: span.private,
      file: fileKey,
      line: span.line,
      endLine: span.endLine,
      digest: digests.get(key) ?? "",
      killed,
      survived,
      uncovered,
      sites: owned.length
    };
  });
}

async function baselineFor(ctx: EngineContext, command: string, cwd: string): Promise<Baseline> {
  const key = `${cwd}\u0000${command}`;
  const cached = ctx.baselines.get(key);
  if (cached) {
    return cached;
  }
  const result = await ctx.runner.run(command, cwd, null);
  const baseline: Baseline =
    result.code === 0 && !result.timedOut
      ? { ok: true, seconds: result.seconds, tail: "" }
      : { ok: false, seconds: result.seconds, tail: result.output.split("\n").slice(-20).join("\n") };
  ctx.baselines.set(key, baseline);
  return baseline;
}

async function runMutants(
  ctx: EngineContext,
  path: string,
  source: string,
  selected: Site[],
  packageDir: string,
  command: string,
  timeout: number,
  outcomes: Map<string, Outcome>
): Promise<void> {
  const unit = relativeKey(ctx.root, packageDir);
  const workers = ctx.pool.workers(unit, workerCount(selected.length, ctx.maxWorkers));
  const queue = [...selected];
  const drain = async (worker: string) => {
    const target = mappedPath(worker, ctx.root, path);
    const cwd = mappedPath(worker, ctx.root, packageDir);
    for (let site = queue.shift(); site !== undefined; site = queue.shift()) {
      if (source.slice(site.start, site.end) !== site.original) {
        ctx.log(`Skipped ${site.file}:${site.line} ${describeSite(site)}; source text moved`);
        outcomes.set(site.mutationId, "survived");
        continue;
      }
      if (ctx.runner.verbose) {
        ctx.log(`${site.file}:${site.line} ${describeSite(site)}`);
      }
      writeFileSync(target, applySite(source, site));
      try {
        const result = await ctx.runner.run(command, cwd, timeout);
        outcomes.set(site.mutationId, result.timedOut || result.code !== 0 ? "killed" : "survived");
      } finally {
        writeFileSync(target, source);
      }
    }
  };
  await Promise.all(workers.map(drain));
}

/** Mutate one file and write its namespaces into `.metrics/mutate`. */
export async function mutateFile(path: string, ctx: EngineContext): Promise<RunResult> {
  const fileKey = relativeKey(ctx.root, path);
  const packageDir = packageDirOf(path, ctx.root);
  if (relativeKey(ctx.root, packageDir) === "") {
    return emptyResult(fileKey, { skipped: "file is not inside a package below the project root" });
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
  } catch {
    return emptyResult(fileKey, { skipped: "file is not UTF-8" });
  }
  const found = sitesInFile(source, path, fileKey);
  const lines = ctx.coveredLines === null ? null : ctx.coveredLines(path);
  const covered = new Map(
    found.map((site) => [site.mutationId, ctx.coveredLines === null || (lines?.has(site.line) ?? false)])
  );
  if (ctx.coveredLines !== null && lines === undefined && found.length > 0) {
    ctx.log(`No coverage data for ${fileKey}; its sites are uncovered. Pass --no-coverage to run them anyway.`);
  }
  const history = ctx.store.history(fileKey, formKey);
  const digests = formDigests(source, findForms(source, path, fileKey));
  const changed = ctx.changedForms === null ? null : ctx.changedForms(path, source);
  const selected = selectSites(found, covered, history, digests, ctx.mutateAll, ctx.lines, changed);
  const outcomes = carryForward(found, covered, history, digests);
  if (selected.length > ctx.mutationWarning) {
    ctx.log(`WARNING: ${selected.length} covered mutations selected in ${fileKey}.`);
  }
  if (selected.length > 0) {
    const command = expandCommand(ctx.testCommand(packageDir), path, packageDir);
    const baseline = await baselineFor(ctx, command, packageDir);
    if (!baseline.ok) {
      const message = `Baseline failed for ${fileKey}: ${command}${baseline.tail ? `\n${baseline.tail}` : ""}`;
      return emptyResult(fileKey, { baselineFailed: true, baselineMessage: message });
    }
    const timeout = Math.max(2, baseline.seconds * ctx.timeoutFactor);
    await runMutants(ctx, path, source, selected, packageDir, command, timeout, outcomes);
  }
  const forms = tallyForms(source, path, fileKey, found, covered, outcomes, ctx.lines);
  const written = ctx.store.write(fileKey, forms, outcomes);
  const statuses = new Map<string, Status>();
  for (const site of found) {
    if (!covered.get(site.mutationId)) {
      statuses.set(site.mutationId, "uncovered");
    } else {
      const outcome = outcomes.get(site.mutationId);
      if (outcome !== undefined) {
        statuses.set(site.mutationId, outcome);
      }
    }
  }
  return { ...emptyResult(fileKey, {}), forms, written, sites: found, statuses };
}
