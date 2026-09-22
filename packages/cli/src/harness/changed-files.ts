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
