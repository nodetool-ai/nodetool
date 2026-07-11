/**
 * File-editing and search tools for agents: Edit, Glob, and Grep.
 *
 * - EditFileTool: exact string replacement in files (and file creation)
 * - GlobTool: file pattern matching, sorted by modification time
 * - GrepTool: content search with regex
 */

import {
  readFile,
  writeFile,
  readdir,
  stat,
  lstat,
  access,
  realpath
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";

/**
 * Largest file grep will read into memory. `walkDir` returns every non-binary
 * file regardless of size, so without this cap a single huge log/jsonl file
 * would be fully buffered (plus a decoded copy and a split array), OOM-ing the
 * shared server process.
 */
const MAX_GREP_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Hard wall-clock budget for the whole grep scan. A caller-supplied regex can
 * trigger catastrophic backtracking; JS regex evaluation is synchronous and
 * uninterruptible, so we bound the aggregate scan time and abort between lines
 * rather than let one pattern pin the event loop indefinitely (ReDoS).
 */
const GREP_TIME_BUDGET_MS = 5000;

/**
 * Longest single line grep will run the regex against. Backtracking blow-ups
 * scale with input length, so skipping pathologically long lines removes the
 * ammunition a ReDoS pattern needs while still matching normal source lines.
 */
const MAX_GREP_LINE_LENGTH = 100_000;

function resolveSafePath(context: ProcessingContext, rawPath: string): string {
  return context.resolveWorkspacePath(rawPath);
}

/**
 * Best-effort detector for the classic catastrophic-backtracking regex family:
 * a quantifier (`+`, `*`, `{n,}`) applied to a group whose body already ends in
 * a quantifier — e.g. `(a+)+`, `(a*)*`, `([a-z]+)+`, `(.*)*`. JS regex matching
 * is synchronous and uninterruptible, and grep runs in the shared server
 * process, so one such pattern against a short line hangs the whole event loop
 * (ReDoS). We reject these patterns up front rather than compile and run them.
 *
 * This is a heuristic, not a proof — it blocks the common ReDoS shapes (and the
 * canonical `(a+)+$` attack) without a time-limited regex engine. The scan-time
 * budget and per-line length cap in GrepTool are the backstop for anything it
 * misses.
 */
function hasNestedQuantifier(pattern: string): boolean {
  // Per open group, whether its body has seen a quantifier. `justClosedQuant`
  // marks that the token immediately to the left was a group that itself
  // contained a quantifier — so an outer quantifier on it is nested.
  const groupHadQuantifier: boolean[] = [];
  let justClosedQuantifiedGroup = false;

  const isQuantifierStart = (i: number): boolean => {
    const ch = pattern[i];
    if (ch === "+" || ch === "*") return true;
    // `{n,}` / `{n,m}` — treat any `{<digit>` as a quantifier.
    return ch === "{" && /\d/.test(pattern[i + 1] ?? "");
  };

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\") {
      i++; // skip the escaped character
      justClosedQuantifiedGroup = false;
      continue;
    }
    if (ch === "[") {
      // Skip character-class body; quantifiers inside `[...]` are literals.
      i++;
      while (i < pattern.length && pattern[i] !== "]") {
        if (pattern[i] === "\\") i++;
        i++;
      }
      justClosedQuantifiedGroup = false;
      continue;
    }
    if (ch === "(") {
      groupHadQuantifier.push(false);
      justClosedQuantifiedGroup = false;
      continue;
    }
    if (ch === ")") {
      justClosedQuantifiedGroup = groupHadQuantifier.pop() ?? false;
      continue;
    }
    if (isQuantifierStart(i)) {
      if (justClosedQuantifiedGroup) return true;
      if (groupHadQuantifier.length > 0) {
        groupHadQuantifier[groupHadQuantifier.length - 1] = true;
      }
      justClosedQuantifiedGroup = false;
      continue;
    }
    justClosedQuantifiedGroup = false;
  }
  return false;
}

/**
 * True when `candidate`'s real (symlink-resolved) path stays within the real
 * workspace root. `resolveWorkspacePath` only checks containment lexically, so
 * an in-workspace symlink pointing outside the root (e.g. unpacked from an
 * imported bundle) would otherwise be dereferenced and leak host files. Returns
 * false when either path cannot be resolved (broken/dangling link).
 */
async function isRealPathWithinRoot(
  root: string,
  candidate: string
): Promise<boolean> {
  try {
    const realRoot = await realpath(root);
    const realCandidate = await realpath(candidate);
    if (realCandidate === realRoot) return true;
    const rel = relative(realRoot, realCandidate);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  } catch {
    return false;
  }
}

/**
 * Like {@link isRealPathWithinRoot} but tolerant of a not-yet-created target:
 * when the candidate does not exist, its parent directory is realpath-checked
 * instead, so creating a file under a symlinked-out directory is still blocked.
 */
async function isEditTargetWithinRoot(
  root: string,
  candidate: string
): Promise<boolean> {
  if (await isRealPathWithinRoot(root, candidate)) return true;
  // Candidate may not exist yet (create path) — check its parent.
  const parent = dirname(candidate);
  if (parent === candidate) return false;
  try {
    // lstat, NOT access: access() follows symlinks, so a DANGLING in-workspace
    // symlink (target outside the root and not yet created) would look absent
    // and fall through to the parent check, allowing a create that follows the
    // link outside the workspace. lstat stats the link itself, so it succeeds
    // and we treat the path as existing-but-out-of-root.
    await lstat(candidate);
    // It exists (as a real file or a symlink) but failed the realpath
    // containment check above → outside the root.
    return false;
  } catch {
    // Truly does not exist; the containing directory must be inside the root.
    return isRealPathWithinRoot(root, parent);
  }
}

/**
 * Detects the alternation-overlap catastrophic-backtracking family that
 * {@link hasNestedQuantifier} misses — a quantifier applied to a group whose
 * top-level branches overlap (a branch equals, or is a prefix of, another),
 * e.g. `(a|a)*`, `(a|ab)+`, `(\d|\d)*`. Such a group can match the same input
 * in exponentially many ways. Prefix/equality on the raw branch text is a
 * conservative proxy: `(cat|car)+` (neither a prefix of the other) is allowed.
 */
function hasOverlappingAlternationQuantifier(pattern: string): boolean {
  // Walk to each group close `)` that is immediately followed by a quantifier,
  // capturing the group body, then split its top-level branches.
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "\\") {
      i++;
      continue;
    }
    if (pattern[i] !== "(") continue;
    // Find the matching close paren, honoring nesting, classes and escapes.
    let depth = 0;
    let j = i;
    for (; j < pattern.length; j++) {
      const ch = pattern[j];
      if (ch === "\\") {
        j++;
        continue;
      }
      if (ch === "[") {
        j++;
        while (j < pattern.length && pattern[j] !== "]") {
          if (pattern[j] === "\\") j++;
          j++;
        }
        continue;
      }
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) break; // unbalanced — let RegExp compile/throw
    const after = pattern[j + 1];
    const quantified =
      after === "*" || after === "+" || (after === "{" && /\d/.test(pattern[j + 2] ?? ""));
    if (quantified) {
      const body = pattern.slice(i + 1, j);
      if (branchesOverlap(splitTopLevelAlternation(body))) return true;
    }
    i = j; // continue scanning after this group
  }
  return false;
}

/** Split a group body on top-level `|`, respecting nesting/classes/escapes. */
function splitTopLevelAlternation(body: string): string[] {
  const branches: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "[") {
      i++;
      while (i < body.length && body[i] !== "]") {
        if (body[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "|" && depth === 0) {
      branches.push(body.slice(start, i));
      start = i + 1;
    }
  }
  branches.push(body.slice(start));
  return branches;
}

/** True if any branch equals or is a prefix of another (raw-text proxy). */
function branchesOverlap(branches: string[]): boolean {
  if (branches.length < 2) return false;
  // Strip a non-capturing-group marker so "(?:a|a)" compares branch bodies.
  const norm = branches.map((b) => b.replace(/^\?:/, ""));
  for (let a = 0; a < norm.length; a++) {
    for (let b = 0; b < norm.length; b++) {
      if (a === b || norm[a] === "") continue;
      if (norm[b] === norm[a] || norm[b].startsWith(norm[a])) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// EditFileTool — exact string replacement in files
// ---------------------------------------------------------------------------

export class EditFileTool extends Tool {
  readonly name = "edit_file";
  readonly description =
    "Perform exact string replacements in a file. The old_string must match exactly " +
    "(including whitespace and indentation). Use replace_all to change every occurrence. " +
    "Prefer this over write_file when modifying existing files — it only sends the diff. " +
    "To create a new file, pass an empty old_string and the full file contents as new_string.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description: "Path to the file to modify, relative to the workspace"
      },
      old_string: {
        type: "string" as const,
        description:
          "The exact text to find and replace. Pass an empty string to create a new file."
      },
      new_string: {
        type: "string" as const,
        description: "The text to replace it with (must differ from old_string)"
      },
      replace_all: {
        type: "boolean" as const,
        description:
          "Replace all occurrences of old_string (default false — only first match)",
        default: false
      }
    },
    required: ["path", "old_string", "new_string"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const rawPath = params["path"];
    const oldString = params["old_string"];
    const newString = params["new_string"];
    const replaceAll = params["replace_all"] === true;

    if (typeof rawPath !== "string")
      return { success: false, error: "path must be a string" };
    if (typeof oldString !== "string")
      return { success: false, error: "old_string must be a string" };
    if (typeof newString !== "string")
      return { success: false, error: "new_string must be a string" };
    if (oldString === newString)
      return {
        success: false,
        error: "old_string and new_string must be different"
      };

    let filePath: string;
    try {
      filePath = resolveSafePath(context, rawPath);
    } catch (e) {
      return {
        success: false,
        error: String(e instanceof Error ? e.message : e)
      };
    }

    // resolveSafePath only checks containment lexically. Follow symlinks and
    // verify the real target (or, for a not-yet-created file, its parent dir)
    // stays inside the workspace, so an in-workspace symlink can't be used to
    // read or overwrite arbitrary host files.
    const workspaceRoot = resolveSafePath(context, ".");
    if (!(await isEditTargetWithinRoot(workspaceRoot, filePath))) {
      return {
        success: false,
        error: `Path resolves outside the workspace: ${rawPath}`
      };
    }

    // Empty old_string is the "create a new file" path. The file must not
    // already exist.
    if (oldString === "") {
      let exists = false;
      try {
        await access(filePath);
        exists = true;
      } catch {
        // File does not exist — the expected case for creation.
      }
      if (exists) {
        return {
          success: false,
          error: "Cannot create new file — file already exists. Use a non-empty old_string to edit it."
        };
      }
      try {
        await writeFile(filePath, newString, "utf-8");
        return { success: true, path: rawPath, created: true };
      } catch (e) {
        return {
          success: false,
          error: `Failed to create file: ${String(e)}`
        };
      }
    }

    try {
      await access(filePath);
    } catch {
      return { success: false, error: `File not found: ${rawPath}` };
    }

    try {
      const content = await readFile(filePath, "utf-8");

      if (!content.includes(oldString)) {
        return {
          success: false,
          error:
            "old_string not found in file. Make sure the string matches exactly, " +
            "including whitespace and indentation."
        };
      }

      // Count occurrences
      let count = 0;
      let idx = 0;
      while ((idx = content.indexOf(oldString, idx)) !== -1) {
        count++;
        idx += oldString.length;
      }

      if (!replaceAll && count > 1) {
        return {
          success: false,
          error: `old_string matches ${count} locations. Provide more surrounding context ` +
            "to make it unique, or set replace_all to true.",
          match_count: count
        };
      }

      // When deleting (empty new_string), also consume a trailing newline that
      // belongs to the removed text so we don't leave a blank line behind.
      let searchString = oldString;
      if (
        newString === "" &&
        !oldString.endsWith("\n") &&
        content.includes(oldString + "\n")
      ) {
        searchString = oldString + "\n";
      }

      let newContent: string;
      if (replaceAll) {
        newContent = content.split(searchString).join(newString);
      } else {
        // Replace only first occurrence
        const firstIdx = content.indexOf(searchString);
        newContent =
          content.slice(0, firstIdx) +
          newString +
          content.slice(firstIdx + searchString.length);
      }

      await writeFile(filePath, newContent, "utf-8");

      return {
        success: true,
        path: rawPath,
        replacements: replaceAll ? count : 1
      };
    } catch (e) {
      return {
        success: false,
        error: `Failed to edit file: ${String(e)}`
      };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Editing file ${String(params["path"] ?? "")}`;
  }
}

// ---------------------------------------------------------------------------
// GlobTool — file pattern matching
// ---------------------------------------------------------------------------

/** Minimal glob matcher supporting *, **, and ? patterns. */
function globToRegex(pattern: string): RegExp {
  let regexStr = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // ** matches anything including /
        if (pattern[i + 2] === "/") {
          regexStr += "(?:.*/)?";
          i += 3;
        } else {
          regexStr += ".*";
          i += 2;
        }
      } else {
        // * matches anything except /
        regexStr += "[^/]*";
        i++;
      }
    } else if (ch === "?") {
      regexStr += "[^/]";
      i++;
    } else if (ch === "{") {
      // Simple brace expansion: {a,b,c}
      const closeIdx = pattern.indexOf("}", i);
      if (closeIdx === -1) {
        regexStr += "\\{";
        i++;
      } else {
        const alternatives = pattern.slice(i + 1, closeIdx).split(",");
        regexStr +=
          "(?:" + alternatives.map((a) => escapeRegex(a)).join("|") + ")";
        i = closeIdx + 1;
      }
    } else if (".+^$|()[]\\".includes(ch)) {
      regexStr += "\\" + ch;
      i++;
    } else {
      regexStr += ch;
      i++;
    }
  }
  return new RegExp("^" + regexStr + "$");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function walkDir(
  dir: string,
  maxDepth: number,
  depth = 0
): Promise<string[]> {
  if (depth > maxDepth) return [];
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      // Skip hidden dirs and node_modules for performance
      if (
        entry.isDirectory() &&
        (entry.name.startsWith(".") || entry.name === "node_modules")
      ) {
        continue;
      }
      // Never follow symlinks: a symlink inside the workspace can point outside
      // the root, and the lexical containment check can't see through it. Skip
      // both file and directory symlinks so grep/glob stay sandboxed.
      if (entry.isSymbolicLink()) {
        continue;
      }
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await walkDir(fullPath, maxDepth, depth + 1)));
      } else {
        results.push(fullPath);
      }
    }
  } catch {
    // Permission denied or broken symlink — skip
  }
  return results;
}

export class GlobTool extends Tool {
  readonly name = "glob";
  readonly description =
    "Find files matching a glob pattern within the workspace. " +
    'Supports patterns like "**/*.ts", "src/**/*.js", "*.{ts,tsx}". ' +
    "Returns matching file paths sorted alphabetically.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      pattern: {
        type: "string" as const,
        description:
          'Glob pattern to match files (e.g. "**/*.ts", "src/**/*.js")'
      },
      path: {
        type: "string" as const,
        description:
          "Directory to search in, relative to workspace (default: workspace root)"
      }
    },
    required: ["pattern"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const pattern = params["pattern"];
    const rawPath = params["path"];

    if (typeof pattern !== "string")
      return { success: false, error: "pattern must be a string" };

    let searchDir: string;
    try {
      searchDir = resolveSafePath(
        context,
        typeof rawPath === "string" ? rawPath : "."
      );
    } catch (e) {
      return {
        success: false,
        error: String(e instanceof Error ? e.message : e)
      };
    }

    // walkDir skips symlink entries, but readdir transparently follows a
    // symlinked search root itself, so realpath-verify it stays in the
    // workspace before walking (mirrors GrepTool).
    const workspaceRoot = resolveSafePath(context, ".");
    if (!(await isRealPathWithinRoot(workspaceRoot, searchDir))) {
      return {
        success: false,
        error: `Path resolves outside the workspace: ${rawPath ?? "."}`
      };
    }

    const maxDepth = pattern.includes("**") ? 20 : 5;
    const LIMIT = 100;
    const start = Date.now();

    try {
      const allFiles = await walkDir(searchDir, maxDepth);
      const regex = globToRegex(pattern);
      const matchedAbs = allFiles.filter((f) =>
        regex.test(relative(searchDir, f))
      );

      // Sort by modification time, most-recently-modified last, so the
      // freshest files land nearest the end of the list the model reads.
      const withMtime = await Promise.all(
        matchedAbs.map(async (f) => {
          let mtime = 0;
          try {
            mtime = (await stat(f)).mtimeMs;
          } catch {
            // Vanished between walk and stat — sort it to the front.
          }
          return { path: relative(searchDir, f), mtime };
        })
      );
      withMtime.sort((a, b) => a.mtime - b.mtime || a.path.localeCompare(b.path));

      const truncated = withMtime.length > LIMIT;
      const files = withMtime.slice(0, LIMIT).map((m) => m.path);

      return {
        success: true,
        pattern,
        match_count: withMtime.length,
        truncated,
        duration_ms: Date.now() - start,
        files
      };
    } catch (e) {
      return {
        success: false,
        error: `Glob search failed: ${String(e)}`
      };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Searching for files: ${String(params["pattern"] ?? "")}`;
  }
}

// ---------------------------------------------------------------------------
// GrepTool — content search with regex
// ---------------------------------------------------------------------------

export class GrepTool extends Tool {
  readonly name = "grep";
  readonly description =
    "Search file contents for lines matching a regex pattern within the workspace. " +
    "Returns matching lines with file paths, line numbers, and optional context lines. " +
    'Use the include parameter to filter files (e.g. "*.ts", "*.{js,jsx}").';
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      pattern: {
        type: "string" as const,
        description: "Regular expression pattern to search for"
      },
      path: {
        type: "string" as const,
        description:
          "Directory or file to search in, relative to workspace (default: workspace root)"
      },
      include: {
        type: "string" as const,
        description:
          'Glob pattern to filter files (e.g. "*.ts", "*.{js,jsx}")'
      },
      context: {
        type: "number" as const,
        description:
          "Number of lines to show before and after each match (default: 0)"
      },
      case_insensitive: {
        type: "boolean" as const,
        description: "Case-insensitive search (default: false)"
      },
      max_results: {
        type: "number" as const,
        description: "Maximum number of matches to return (default: 100)"
      }
    },
    required: ["pattern"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const pattern = params["pattern"];
    const rawPath = params["path"];
    const include = params["include"];
    const contextLines =
      typeof params["context"] === "number" ? params["context"] : 0;
    const caseInsensitive = params["case_insensitive"] === true;
    const maxResults =
      typeof params["max_results"] === "number" ? params["max_results"] : 100;

    if (typeof pattern !== "string")
      return { success: false, error: "pattern must be a string" };

    let searchDir: string;
    try {
      searchDir = resolveSafePath(
        context,
        typeof rawPath === "string" ? rawPath : "."
      );
    } catch (e) {
      return {
        success: false,
        error: String(e instanceof Error ? e.message : e)
      };
    }

    if (hasNestedQuantifier(pattern) || hasOverlappingAlternationQuantifier(pattern)) {
      return {
        success: false,
        error:
          "Pattern rejected: it can cause catastrophic backtracking (a " +
          "quantifier applied to an already-quantified group like \"(a+)+\", or " +
          "to a group with overlapping alternation branches like \"(a|a)*\"). " +
          "Rewrite the pattern to avoid nested/overlapping quantifiers."
      };
    }

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, caseInsensitive ? "i" : "");
    } catch (e) {
      return {
        success: false,
        error: `Invalid regex: ${String(e)}`
      };
    }

    // The workspace root, used to reject symlinks that escape it. searchDir was
    // only checked lexically, so a symlinked target must be realpath-verified.
    const workspaceRoot = resolveSafePath(context, ".");
    if (!(await isRealPathWithinRoot(workspaceRoot, searchDir))) {
      return {
        success: false,
        error: `Path resolves outside the workspace: ${rawPath ?? "."}`
      };
    }

    // Determine if searching a single file or a directory
    let filesToSearch: string[];
    try {
      const info = await stat(searchDir);
      if (info.isFile()) {
        filesToSearch = [searchDir];
      } else {
        // Walk the directory
        const allFiles = await walkDir(searchDir, 20);
        filesToSearch = allFiles;
      }
    } catch {
      return { success: false, error: `Path not found: ${rawPath ?? "."}` };
    }

    // Apply include filter
    if (typeof include === "string") {
      const includeRegex = globToRegex(include);
      filesToSearch = filesToSearch.filter((f) => {
        const rel = relative(searchDir, f);
        const basename = rel.split("/").pop() ?? rel;
        return includeRegex.test(basename) || includeRegex.test(rel);
      });
    }

    // Filter out binary-looking files by extension
    const binaryExts = new Set([
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".bmp",
      ".ico",
      ".svg",
      ".webp",
      ".mp3",
      ".mp4",
      ".wav",
      ".ogg",
      ".avi",
      ".mov",
      ".zip",
      ".tar",
      ".gz",
      ".bz2",
      ".7z",
      ".rar",
      ".pdf",
      ".woff",
      ".woff2",
      ".ttf",
      ".eot",
      ".otf",
      ".so",
      ".dylib",
      ".dll",
      ".exe",
      ".o",
      ".a",
      ".node",
      ".wasm"
    ]);
    filesToSearch = filesToSearch.filter((f) => {
      const ext = f.slice(f.lastIndexOf(".")).toLowerCase();
      return !binaryExts.has(ext);
    });

    interface GrepMatch {
      file: string;
      line: number;
      content: string;
      context_before?: string[];
      context_after?: string[];
    }

    const matches: GrepMatch[] = [];
    let totalMatches = 0;
    const deadline = Date.now() + GREP_TIME_BUDGET_MS;
    let timedOut = false;

    for (const file of filesToSearch) {
      if (totalMatches >= maxResults) break;
      if (Date.now() > deadline) {
        timedOut = true;
        break;
      }

      // Skip oversized files: reading them buffers the whole file (plus a
      // decoded copy and a split array) into the shared process heap.
      try {
        const fileInfo = await stat(file);
        if (fileInfo.size > MAX_GREP_FILE_BYTES) continue;
      } catch {
        continue;
      }

      let content: string;
      try {
        const buf = await readFile(file);
        // Skip binary files (null byte check)
        if (buf.subarray(0, 512).includes(0)) continue;
        content = buf.toString("utf-8");
      } catch {
        continue;
      }

      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (totalMatches >= maxResults) break;
        // Bound total scan time so a catastrophic-backtracking pattern can't
        // pin the event loop indefinitely; abort between lines.
        if (Date.now() > deadline) {
          timedOut = true;
          break;
        }
        // Skip pathologically long lines — backtracking blow-ups scale with
        // input length, and such lines are not meaningful source matches.
        if (lines[i].length > MAX_GREP_LINE_LENGTH) continue;
        if (regex.test(lines[i])) {
          const match: GrepMatch = {
            file: relative(searchDir, file),
            line: i + 1,
            content: lines[i]
          };

          if (contextLines > 0) {
            const start = Math.max(0, i - contextLines);
            const end = Math.min(lines.length - 1, i + contextLines);
            if (start < i) {
              match.context_before = lines.slice(start, i);
            }
            if (end > i) {
              match.context_after = lines.slice(i + 1, end + 1);
            }
          }

          matches.push(match);
          totalMatches++;
        }
      }
      if (timedOut) break;
    }

    return {
      success: true,
      pattern,
      match_count: matches.length,
      truncated: totalMatches >= maxResults,
      timed_out: timedOut,
      matches
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Searching for: ${String(params["pattern"] ?? "")}`;
  }
}
