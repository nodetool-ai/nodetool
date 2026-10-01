import { execFileSync } from "node:child_process";

export interface CollectChangedFilesInput {
  base?: string;
  /** `git status --porcelain=v1 -z --untracked-files=all` output. */
  statusOutput: string;
  /** `git diff --name-only --no-renames -z <base>...HEAD` output. */
  diffOutput?: string;
}

/** Collect both sides of renames, deletions, and uncommitted files. */
export function collectChangedFiles({
  base,
  statusOutput,
  diffOutput
}: CollectChangedFilesInput): string[] {
  const files = base ? (diffOutput ?? "").split("\0").filter(Boolean) : [];
  const records = statusOutput.split("\0");
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (!record || record.length <= 3) {
      continue;
    }
    files.push(record.slice(3));
    // In -z status a rename/copy has destination first, then source.
    if (/[RC]/.test(record.slice(0, 2))) {
      const source = records[++i];
      if (source) {
        files.push(source);
      }
    }
  }
  return [...new Set(files)];
}

/** Read committed and working-tree paths for harness selection. */
export function readChangedFiles(repoRoot: string, base?: string): string[] {
  const git = (args: string[]): string =>
    execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8"
    });
  return collectChangedFiles({
    base,
    statusOutput: git([
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all"
    ]),
    diffOutput: base
      ? git([
          "diff",
          "--name-only",
          "--no-renames",
          "-z",
          `${base}...HEAD`,
          "--"
        ])
      : undefined
  });
}

const GATE_RELEVANT_CODE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".mts"
];

/**
 * A changed file `--strict` should hold to account: real source, not a test
 * file or documentation. Used to fail the gate when a diff leaves a code
 * file mapped to no surface at all (`plan.unmappedFiles`).
 */
export function isGateRelevantCodeFile(path: string): boolean {
  if (/\.(test|spec)\./.test(path)) {
    return false;
  }
  if (/(^|\/)(__tests__|tests)\//.test(path)) {
    return false;
  }
  if (/(^|\/)docs\//.test(path)) {
    return false;
  }
  if (/\.(md|markdown)$/i.test(path)) {
    return false;
  }
  return GATE_RELEVANT_CODE_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/**
 * Root files whose change can alter any workspace's behavior: dependency
 * manifests, shared compiler and test config, the Node pin, and the shared
 * build/test launchers. Mirrors what `npm run test:affected` runs everything
 * for (a file outside every workspace that is neither documentation nor
 * covered by a `PATH_CHECKS` entry). A nested workspace `package.json` belongs
 * to its own surface and is not listed. `.github/` is documentation to
 * `test:affected`, so workflow edits stay out too.
 */
const GLOBAL_GATE_FILE =
  /^(package\.json|package-lock\.json|tsconfig[^/]*\.json|turbo\.json|\.nvmrc|vitest\.config\.[cm]?[jt]s|scripts\/run-(turbo|vitest|tsc)\.mjs)$/;

/** A changed file that forces every selfcheck, whatever surfaces it maps to. */
export function isGlobalGateFile(path: string): boolean {
  return GLOBAL_GATE_FILE.test(path.replace(/^\.\//, "").replace(/\\/g, "/"));
}
