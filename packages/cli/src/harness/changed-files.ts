/**
 * Changed-file collection for `nodetool harness gate` — pure parsing over
 * git command output, so rename handling, deleted-file inclusion, and the
 * base-ref + working-tree merge are unit-testable without a git repo.
 */

export interface CollectChangedFilesInput {
  /** When set, `diffOutput` must carry `git diff --name-only <base>...HEAD`. */
  base?: string;
  /**
   * `git status --porcelain` output for the working tree. Always read —
   * with `base` set, uncommitted work would otherwise be invisible to a
   * diff against a merge-base ref.
   */
  statusOutput: string;
  /** `git diff --name-only <base>...HEAD` output. Read only when `base` is set. */
  diffOutput?: string;
}

/**
 * Resolve the files a gate run should consider: the working tree always,
 * plus (with `--base`) everything that differs from that ref, deduped.
 */
export function collectChangedFiles({
  base,
  statusOutput,
  diffOutput
}: CollectChangedFilesInput): string[] {
  const fromStatus = parsePorcelainStatus(statusOutput);
  if (!base) {
    return fromStatus;
  }
  const fromDiff = parseNameOnlyDiff(diffOutput ?? "");
  return dedupe([...fromDiff, ...fromStatus]);
}

/** Parse every line of `git status --porcelain` output into touched paths. */
export function parsePorcelainStatus(output: string): string[] {
  return output
    .split("\n")
    .map(parsePorcelainLine)
    .filter((f): f is string => f !== null);
}

/**
 * One `git status --porcelain` line → the path it touches, or `null` for a
 * blank line. Status codes occupy columns 1-2, a separator space is column
 * 3, and the path starts at column 4 (index 3) — true for ordinary
 * modify/add/delete lines (`D  path`, ` D path`, deletions included) and for
 * rename/copy lines (`R  old -> new`, `RM old -> new`, `C  a -> b`), which
 * resolve to the NEW path: the old path no longer exists on disk, so there
 * is nothing there for a surface check to lint or type-check.
 */
export function parsePorcelainLine(line: string): string | null {
  if (line.length <= 3) {
    return null;
  }
  const rest = line.slice(3).trim();
  if (!rest) {
    return null;
  }
  const arrow = rest.indexOf(" -> ");
  return unquotePath(arrow >= 0 ? rest.slice(arrow + 4).trim() : rest);
}

/**
 * Undo git's C-style quoting. Porcelain status wraps a path in double quotes
 * as soon as it holds a space or a non-ASCII byte, and every shipped example
 * workflow has a space in its name — so without this a gate run over
 * uncommitted work sees `"…/Three Ratios.json"`, matches it against no
 * surface, and reports it unmapped. `git diff --name-only` does not quote, so
 * only this half needs it.
 */
function unquotePath(path: string): string {
  if (path.length < 2 || !path.startsWith('"') || !path.endsWith('"')) {
    return path;
  }
  return path
    .slice(1, -1)
    .replace(/\\(["\\])/g, "$1")
    .replace(/\\t/g, "\t")
    .replace(/\\n/g, "\n");
}

function parseNameOnlyDiff(output: string): string[] {
  return output
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function dedupe(files: string[]): string[] {
  return [...new Set(files)];
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
