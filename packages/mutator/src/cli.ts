#!/usr/bin/env node
/** Command line for the TypeScript mutation tool. */

import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readCoverageDir, type CoverageMap } from "./coverage.js";
import { mutateFile, type Baseline, type EngineContext, type RunResult } from "./engine.js";
import { formDigests, formKey, findForms, sitesInFile } from "./forms.js";
import { filesChangedSince, formsChangedSince, mergeBase, statusChangedFiles } from "./git.js";
import { packageDirOf, quote, relativeKey, SOURCE_EXTENSIONS, defaultTestCommand, usesVitest, hasScript } from "./project.js";
import { formatResults, formatScan, formatSiteLog } from "./report.js";
import { ShellRunner, type CommandRunner } from "./runner.js";
import { SnapshotStore } from "./snapshot.js";
import { removeStaleWorkers, WorkerPool } from "./workers.js";

export const SKIP_DIRS = new Set([
  ".git",
  ".metrics",
  ".turbo",
  "__tests__",
  "__mocks__",
  "__snapshots__",
  "build",
  "coverage",
  "dist",
  "fixtures",
  "node_modules",
  "out",
  "reports",
  "spec",
  "target",
  "test",
  "tests",
  "vendor"
]);

export const HELP = `Usage: nodetool-mutator [options] [path-or-filter ...]

Discover mutation sites in TypeScript and JavaScript, run the owning
package's tests against each one, and write .metrics/mutate/<namespace>.json.
A port of unclebob/mutator restricted to TypeScript.

A mutant is killed when the tests fail or time out, and survives when they
pass. A site on a line the coverage report does not hit is uncovered and is
not run. The score is killed / (killed + survived).

Options:
  -h, --help                  Print this help and exit.
  --root <path>               Project root. Snapshots and workers live here.
                              Default: the current directory.
  --changed                   Mutate added and modified files from git status.
  --base <ref>                Mutate files changed since the merge-base with
                              <ref> (plus the working tree), and only the
                              functions whose text differs from that base.
  --scan                      List mutation sites. Do not run tests or write
                              snapshots.
  --mutate-all                Run every covered site, including ones the last
                              snapshot already killed.
  --since-last-run            Run survivors and sites in new or rewritten
                              functions. The default once a snapshot exists.
  --lines <n,n,...>           Run only mutations on these source lines.
  --no-coverage               Treat every site as covered.
  --use-existing-coverage     Read <package>/coverage/coverage-final.json or
                              lcov.info instead of producing coverage.
  --reuse-coverage            Same as --use-existing-coverage.
  --coverage-command <cmd>    Run this in each package, then read the reports
                              it wrote to <package>/coverage.
  --test-command <cmd>        Run this for the baseline and every mutant, in
                              the package directory. {file} expands to the
                              mutated file relative to that directory.
  --timeout-factor <number>   Mutant timeout as a multiple of the baseline
                              duration. Default: 10. At least 2 seconds.
  --mutation-warning <number> Warn when a file selects more covered sites than
                              this. Default: 50.
  --max-workers <number>      Run at most this many mutants of one file at
                              once. Default: one per core.
  --exclude <text>            Skip source files whose path contains this text.
                              May be repeated.
  --metrics-dir <path>        Write snapshots here instead of .metrics/mutate,
                              relative to the root. A run with a different
                              test oracle needs its own directory.
  --verbose                   Print each test command and each mutant.

Arguments:
  path      File or directory to mutate. Test files and directories are skipped.
  filter    When the argument is not a path, only source files whose path
            contains this text are mutated.

Default test command: a Vitest package runs
  npx --no-install vitest related --run --passWithNoTests {file}
and any other package runs npm test. Default coverage for a Vitest package is
a V8 coverage run of its suite.

Mutants of one file run at the same time in worker overlays under
target/mutation-workers: the owning package is copied, and everything else is
a symlink. The project tree is not modified.

Exit codes:
  0  every executed mutant was killed, or there was nothing to run
  1  usage error
  2  baseline tests failed
  3  at least one mutant survived
`;

export interface Options {
  root: string;
  changed: boolean;
  base: string | null;
  scan: boolean;
  mutateAll: boolean;
  lines: Set<number> | null;
  coverage: "generate" | "existing" | "none";
  coverageCommand: string | null;
  testCommand: string | null;
  timeoutFactor: number;
  mutationWarning: number;
  maxWorkers: number | null;
  verbose: boolean;
  exclude: string[];
  metricsDir: string;
  targets: string[];
}

export class UsageError extends Error {}

function positive(flag: string, value: string | undefined, integer: boolean): number {
  const number = Number(value);
  if (value === undefined || !Number.isFinite(number) || number <= 0 || (integer && !Number.isInteger(number))) {
    throw new UsageError(`${flag} needs a positive ${integer ? "integer" : "number"}`);
  }
  return number;
}

export function parseArgs(argv: string[], cwd = process.cwd()): Options | "help" {
  const options: Options = {
    root: cwd,
    changed: false,
    base: null,
    scan: false,
    mutateAll: false,
    lines: null,
    coverage: "generate",
    coverageCommand: null,
    testCommand: null,
    timeoutFactor: 10,
    mutationWarning: 50,
    maxWorkers: null,
    verbose: false,
    exclude: [],
    metricsDir: join(".metrics", "mutate"),
    targets: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined) {
        throw new UsageError(`${arg} needs a value`);
      }
      index += 1;
      return next;
    };
    switch (arg) {
      case "-h":
      case "--help":
        return "help";
      case "--root":
        options.root = resolve(cwd, value());
        break;
      case "--changed":
        options.changed = true;
        break;
      case "--base":
        options.base = value();
        break;
      case "--scan":
        options.scan = true;
        break;
      case "--mutate-all":
        options.mutateAll = true;
        break;
      case "--since-last-run":
        break;
      case "--lines":
        options.lines = new Set(value().split(",").map((line) => positive("--lines", line.trim(), true)));
        break;
      case "--no-coverage":
        options.coverage = "none";
        break;
      case "--use-existing-coverage":
      case "--reuse-coverage":
        options.coverage = "existing";
        break;
      case "--coverage-command":
        options.coverageCommand = value();
        break;
      case "--test-command":
        options.testCommand = value();
        break;
      case "--timeout-factor":
        options.timeoutFactor = positive(arg, value(), false);
        break;
      case "--mutation-warning":
        options.mutationWarning = positive(arg, value(), true);
        break;
      case "--max-workers":
        options.maxWorkers = positive(arg, value(), true);
        break;
      case "--verbose":
        options.verbose = true;
        break;
      case "--exclude":
        options.exclude.push(value());
        break;
      case "--metrics-dir":
        options.metricsDir = value();
        break;
      default:
        if (arg.startsWith("-")) {
          throw new UsageError(`unknown option ${arg}`);
        }
        options.targets.push(arg);
    }
  }
  if (options.changed && options.base !== null) {
    throw new UsageError("--changed and --base cannot be combined");
  }
  return options;
}

export function isSourceFile(path: string): boolean {
  const name = basename(path);
  if (!SOURCE_EXTENSIONS.includes(extname(name)) || /\.d\.[cm]?ts$/.test(name)) {
    return false;
  }
  return !/\.(test|spec|bench)\.[cm]?[jt]sx?$/.test(name);
}

function inSkippedDir(path: string, root: string): boolean {
  return relativeKey(root, path)
    .split("/")
    .slice(0, -1)
    .some((segment) => SKIP_DIRS.has(segment) || segment.startsWith("."));
}

export function walk(directory: string, root: string): string[] {
  const found: string[] = [];
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const name of readdirSync(current).sort().reverse()) {
      const path = join(current, name);
      const stat = statSync(path, { throwIfNoEntry: false });
      if (stat?.isDirectory()) {
        if (!SKIP_DIRS.has(name) && !name.startsWith(".")) {
          stack.push(path);
        }
      } else if (stat?.isFile() && isSourceFile(path) && !inSkippedDir(path, root)) {
        found.push(path);
      }
    }
  }
  return found.sort();
}

export function selectFiles(options: Options, cwd: string): string[] {
  const root = options.root;
  let candidates: string[];
  if (options.changed) {
    candidates = statusChangedFiles(root);
  } else if (options.base !== null) {
    candidates = filesChangedSince(root, mergeBase(root, options.base));
  } else {
    candidates = [];
  }
  const fromGit = options.changed || options.base !== null;
  const usable = (path: string) =>
    existsSync(path) && isSourceFile(path) && !inSkippedDir(path, root) && path.startsWith(resolve(root));
  if (fromGit) {
    candidates = candidates.filter(usable);
  }
  const paths: string[] = [];
  const filters: string[] = [];
  for (const target of options.targets) {
    const path = resolve(cwd, target);
    if (existsSync(path)) {
      paths.push(path);
    } else {
      filters.push(target);
    }
  }
  let files: string[];
  if (paths.length > 0) {
    const listed = paths.flatMap((path) => (statSync(path).isDirectory() ? walk(path, root) : [path]));
    files = fromGit ? candidates.filter((file) => listed.includes(file)) : listed;
  } else if (fromGit) {
    files = candidates;
  } else {
    files = walk(root, root);
  }
  if (filters.length > 0) {
    files = files.filter((file) => filters.some((filter) => relativeKey(root, file).includes(filter)));
  }
  if (options.exclude.length > 0) {
    files = files.filter((file) => !options.exclude.some((text) => relativeKey(root, file).includes(text)));
  }
  return [...new Set(files)].sort();
}

/** Coverage per package, produced or read on first use. */
export class CoverageProvider {
  private readonly cache = new Map<string, CoverageMap | null>();

  constructor(
    private readonly options: Options,
    private readonly runner: CommandRunner,
    private readonly log: (message: string) => void
  ) {}

  async prepare(packageDir: string): Promise<void> {
    if (this.cache.has(packageDir)) {
      return;
    }
    this.cache.set(packageDir, await this.load(packageDir));
  }

  lines(path: string): Set<number> | undefined {
    const map = this.cache.get(packageDirOf(path, this.options.root));
    return map?.get(resolve(path));
  }

  private async load(packageDir: string): Promise<CoverageMap | null> {
    const own = join(packageDir, "coverage");
    if (this.options.coverage === "existing") {
      return readCoverageDir(own, packageDir);
    }
    let command: string | null = this.options.coverageCommand;
    let reports = own;
    if (command === null && usesVitest(packageDir)) {
      reports = join(this.options.root, "target", "mutator-coverage", relativeKey(this.options.root, packageDir));
      rmSync(reports, { recursive: true, force: true });
      command =
        "npx --no-install vitest run --passWithNoTests --coverage.enabled=true --coverage.provider=v8 " +
        `--coverage.reporter=json --coverage.reportOnFailure=true --coverage.reportsDirectory=${quote(reports)}`;
    } else if (command === null && hasScript(packageDir, "coverage")) {
      command = "npm run coverage";
    }
    if (command === null) {
      this.log(`No coverage command for ${relativeKey(this.options.root, packageDir)}; its sites are uncovered.`);
      return null;
    }
    const result = await this.runner.run(command, packageDir, null);
    if (result.code !== 0) {
      this.log(`Coverage command exited ${result.code} in ${relativeKey(this.options.root, packageDir)}: ${command}`);
    }
    return readCoverageDir(reports, packageDir);
  }
}

function scan(files: string[], options: Options, coverage: CoverageProvider | null, store: SnapshotStore): string {
  let text = "";
  for (const path of files) {
    const fileKey = relativeKey(options.root, path);
    const source = readFileSync(path, "utf8");
    let sites = sitesInFile(source, path, fileKey);
    if (options.lines !== null) {
      const lines = options.lines;
      sites = sites.filter((site) => lines.has(site.line));
    }
    const lines = coverage?.lines(path);
    const covered = lines === undefined ? null : new Map(sites.map((site) => [site.mutationId, lines.has(site.line)]));
    const history = store.history(fileKey, formKey);
    const changed = new Set<string>();
    if (history.forms.size > 0) {
      for (const [key, digest] of formDigests(source, findForms(source, path, fileKey))) {
        if (history.forms.get(key) !== digest) {
          changed.add(key);
        }
      }
    }
    text += formatScan(fileKey, sites, changed, covered, (site) => formKey(site.namespace, site.formId));
  }
  return text;
}

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
}

export async function run(argv: string[], io: Io = defaultIo, runner?: CommandRunner): Promise<number> {
  let parsed: Options | "help";
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`${error.message}\n\n${HELP}`);
      return 1;
    }
    throw error;
  }
  if (parsed === "help") {
    io.out(HELP);
    return 0;
  }
  const options = parsed;
  const log = (message: string) => io.err(`${message}\n`);
  const shell = runner ?? new ShellRunner(options.verbose);
  const files = selectFiles(options, process.cwd());
  const store = new SnapshotStore(options.root, options.metricsDir);
  const coverage = options.coverage === "none" ? null : new CoverageProvider(options, shell, log);

  if (options.scan) {
    if (coverage !== null && options.coverage === "existing") {
      for (const file of files) {
        await coverage.prepare(packageDirOf(file, options.root));
      }
    }
    io.out(scan(files, options, options.coverage === "existing" ? coverage : null, store));
    return 0;
  }
  if (files.length === 0) {
    io.out("No source files selected.\n");
    return 0;
  }

  removeStaleWorkers(options.root);
  const pool = new WorkerPool(options.root);
  const baselines = new Map<string, Baseline>();
  const base = options.base === null ? null : mergeBase(options.root, options.base);
  const ctx: EngineContext = {
    root: options.root,
    runner: shell,
    store,
    pool,
    coveredLines: coverage === null ? null : (path) => coverage.lines(path),
    mutateAll: options.mutateAll,
    lines: options.lines,
    changedForms:
      base === null
        ? null
        : (path, source) => formsChangedSince(options.root, base, path, relativeKey(options.root, path), source),
    testCommand: (packageDir) => options.testCommand ?? defaultTestCommand(packageDir),
    timeoutFactor: options.timeoutFactor,
    mutationWarning: options.mutationWarning,
    maxWorkers: options.maxWorkers,
    baselines,
    log
  };
  const cleanup = () => {
    pool.dispose();
    process.exit(130);
  };
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);
  const results: RunResult[] = [];
  try {
    for (const path of files) {
      await coverage?.prepare(packageDirOf(path, options.root));
      const result = await mutateFile(path, ctx);
      if (result.skipped !== "") {
        log(`Skipped ${result.path}: ${result.skipped}`);
        continue;
      }
      if (result.baselineFailed) {
        log(result.baselineMessage);
        return 2;
      }
      io.out(formatSiteLog(result.sites, result.statuses));
      results.push(result);
    }
  } finally {
    process.removeListener("SIGINT", cleanup);
    process.removeListener("SIGTERM", cleanup);
    pool.dispose();
  }
  io.out(formatResults(results.flatMap((result) => result.forms)));
  const survived = results.some((result) =>
    result.sites.some((site) => result.statuses.get(site.mutationId) === "survived")
  );
  return survived ? 3 : 0;
}

const defaultIo: Io = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text)
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
      process.exitCode = 1;
    }
  );
}
