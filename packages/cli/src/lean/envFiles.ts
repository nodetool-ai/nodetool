import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parseEnvFile } from "@nodetool-ai/config";

/** Where an env file sits in the search order. */
export type EnvFileScope = "flag" | "NODETOOL_ENV_FILE" | "project" | "home";

export interface EnvFileCandidate {
  readonly path: string;
  readonly scope: EnvFileScope;
}

export interface EnvFileReport extends EnvFileCandidate {
  readonly exists: boolean;
  /** Names this file set: absent from the environment and from every earlier file. */
  readonly applied: readonly string[];
  /** Names in the file that an earlier source already set. */
  readonly shadowed: readonly string[];
  readonly warnings: readonly string[];
}

export interface EnvLoadResult {
  readonly files: readonly EnvFileReport[];
  /** Variable name to the env file that supplied it. Names missing here came from the process environment. */
  readonly sources: Readonly<Record<string, string>>;
}

export interface EnvLoadOptions {
  /** Mutated in place: values from env files are added to it. */
  readonly env: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly home?: string;
  /** Value of `--env-file`. */
  readonly envFile?: string;
}

const isSet = (value: string | undefined): value is string => value !== undefined && value !== "";

/**
 * Env files in precedence order, highest first: `--env-file`, then
 * NODETOOL_ENV_FILE, then `./.env.local` and `./.env` in the working
 * directory, then `~/.nodetool/.env` and `~/.env`. A path reached twice (the
 * working directory is the home directory) is listed once.
 */
export function envFileCandidates(options: Omit<EnvLoadOptions, "env"> & { readonly env: NodeJS.ProcessEnv }): EnvFileCandidate[] {
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? (options.env.HOME || options.env.USERPROFILE || homedir());
  const candidates: EnvFileCandidate[] = [];
  if (isSet(options.envFile)) { candidates.push({ path: resolve(cwd, options.envFile), scope: "flag" }); }
  if (isSet(options.env.NODETOOL_ENV_FILE)) { candidates.push({ path: resolve(cwd, options.env.NODETOOL_ENV_FILE), scope: "NODETOOL_ENV_FILE" }); }
  candidates.push(
    { path: join(cwd, ".env.local"), scope: "project" },
    { path: join(cwd, ".env"), scope: "project" },
    { path: join(home, ".nodetool", ".env"), scope: "home" },
    { path: join(home, ".env"), scope: "home" }
  );
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const path = resolve(candidate.path);
    if (seen.has(path)) { return false; }
    seen.add(path);
    return true;
  });
}

/** Permission warnings for one env file. Windows has no POSIX mode bits to check. */
export function envFilePermissionWarnings(path: string): string[] {
  if (process.platform === "win32") { return []; }
  try {
    const mode = statSync(path).mode;
    if (mode & 0o004) { return [`${path} is readable by every user on this machine. Restrict it with \`chmod 600 ${path}\`.`]; }
    if (mode & 0o040) { return [`${path} is readable by its group. Restrict it with \`chmod 600 ${path}\`.`]; }
  } catch {
    // The file vanished after it was read: nothing to warn about.
  }
  return [];
}

/** True when git tracks the file. False when git is missing or the file is outside a repository. */
export function isGitTracked(path: string): boolean {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", basename(path)], { cwd: dirname(path), stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    // Untracked, outside a repository, or no git executable.
    return false;
  }
}

/**
 * Apply env files to `options.env`. A variable already set in the environment
 * always wins, and among files the first in the search order wins. Values are
 * never logged or returned: only names and paths. A file named by
 * `--env-file` or NODETOOL_ENV_FILE must exist.
 */
export function loadCliEnvironment(options: EnvLoadOptions): EnvLoadResult {
  const { env } = options;
  const files: EnvFileReport[] = [];
  const sources: Record<string, string> = {};
  for (const candidate of envFileCandidates(options)) {
    if (!existsSync(candidate.path)) {
      if (candidate.scope === "flag" || candidate.scope === "NODETOOL_ENV_FILE") {
        throw new Error(`Env file ${candidate.path} does not exist. It was named by ${candidate.scope === "flag" ? "--env-file" : "NODETOOL_ENV_FILE"}.`);
      }
      files.push({ ...candidate, exists: false, applied: [], shadowed: [], warnings: [] });
      continue;
    }
    const applied: string[] = [];
    const shadowed: string[] = [];
    for (const [name, value] of Object.entries(parseEnvFile(readFileSync(candidate.path, "utf8")))) {
      // An empty assignment (`KEY=`) is a placeholder, not a value: it must not hide a lower file.
      if (value === "") { continue; }
      if (isSet(env[name])) { shadowed.push(name); continue; }
      env[name] = value;
      sources[name] = candidate.path;
      applied.push(name);
    }
    files.push({ ...candidate, exists: true, applied, shadowed, warnings: envFilePermissionWarnings(candidate.path) });
  }
  return { files, sources };
}

/**
 * Remove `--env-file <path>` and `--env-file=<path>` from argv, before any
 * `--`, so command features never see the flag.
 */
export function extractEnvFileFlag(argv: readonly string[]): { argv: string[]; envFile?: string } {
  const rest: string[] = [];
  let envFile: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index] ?? "";
    if (argument === "--") { rest.push(...argv.slice(index)); break; }
    if (argument === "--env-file") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) { throw new Error("--env-file needs a path, e.g. --env-file ./staging.env"); }
      envFile = value;
      index++;
    } else if (argument.startsWith("--env-file=")) {
      envFile = argument.slice("--env-file=".length);
      if (!envFile) { throw new Error("--env-file needs a path, e.g. --env-file=./staging.env"); }
    } else {
      rest.push(argument);
    }
  }
  return envFile === undefined ? { argv: rest } : { argv: rest, envFile };
}

/** One line per loaded file, names only. */
export function describeEnvLoad(result: EnvLoadResult): string[] {
  return result.files.filter(file => file.exists).map(file => `Loaded ${file.applied.length} variable(s) from ${file.path}${file.applied.length ? `: ${file.applied.join(", ")}` : ""}`);
}
