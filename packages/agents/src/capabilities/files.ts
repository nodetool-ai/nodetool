/**
 * The `files` capability module — the workspace namespace.
 *
 * Seven capabilities that used to be seven `Tool` subclasses across three
 * files: `read_file`, `write_file` and `list_directory` (`filesystem-tools.ts`),
 * `edit_file`, `glob` and `grep` (`edit-search-tools.ts`), and `todo_write`
 * (`todo-tools.ts`, the per-thread checklist).
 *
 * All six file capabilities go through `context.workspace`, never `node:fs`.
 * That is what makes them work on a cloud deployment, where the workspace is a
 * prefix in object storage and there is no directory to walk — and it is why
 * the symlink guards that used to live here are gone: containment is the
 * workspace's own rule, checked once, in one place.
 *
 * Every one is context-only: what the class read off the `ProcessingContext`
 * the implementation reads off `run.context`, and nothing else rides on the
 * run. A belt builds all seven from `files.specs.ts` by name, so
 * `BUILTIN_TOOL_NAMES` and `resolveTool(name)` see what they saw before.
 *
 * The todo store lives here with the implementation that writes it;
 * `../tools/todo-tools.ts` re-exports the three readers other code calls.
 *
 * Design: docs/tool-class-retirement-design.md § "PRs 4–9 — remaining
 * namespaces".
 */

import type {
  JsonSchema,
  ProcessingContext,
  Workspace,
  WorkspaceEntry
} from "@nodetool-ai/runtime";
import type { TodoItem, TodoStatus, TodoUpdate } from "@nodetool-ai/protocol";
import { Tool } from "../tools/base-tool.js";
import {
  isNonBlankString,
  isNumber,
  isObjectLike,
  isString
} from "../utils/type-guards.js";
import { UNGATED, createCapabilityRun } from "./invoke.js";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  readFileCapabilitySpec,
  writeFileCapabilitySpec,
  listDirectorySpec,
  editFileSpec,
  globSpec,
  grepSpec,
  todoWriteSpec,
  READ_FILE_SCHEMA,
  WRITE_FILE_SCHEMA,
  LIST_DIRECTORY_SCHEMA,
  EDIT_FILE_SCHEMA,
  GLOB_SCHEMA,
  GREP_SCHEMA,
  TODO_WRITE_SCHEMA
} from "./files.specs.js";

export {
  READ_FILE_SCHEMA,
  WRITE_FILE_SCHEMA,
  LIST_DIRECTORY_SCHEMA,
  EDIT_FILE_SCHEMA,
  GLOB_SCHEMA,
  GREP_SCHEMA,
  TODO_WRITE_SCHEMA
} from "./files.specs.js";

/**
 * A run over one call's context — all a file capability needs. The deprecated
 * tool classes pass this to `CapabilityTool`, which is gated from the outside
 * by `gateTools` exactly as the classes were before the port.
 */
export function fileCapabilityRun(context: ProcessingContext): CapabilityRun {
  return createCapabilityRun({ context, gate: UNGATED });
}

// ---------------------------------------------------------------------------
// Workspace storage helpers — shared by read_file, write_file, list_directory
// ---------------------------------------------------------------------------

const MAX_READ_CHARS = 100_000;
const MAX_TOKENS = 25_000;
const TOKEN_MODEL = "gpt-4" as const;
const DEFAULT_READ_LIMIT = 2000;

/** Context variable holding the set of file paths read in this session. */
const READ_TRACKER_KEY = "__nt_read_files";

/**
 * The session's read set, or null on a context with no variable store.
 *
 * The tracker is a guard rail, not a guarantee: a host that wires a context
 * without variables (a node running one tool, a test double) still gets to
 * edit files. It loses only the "read it before you overwrite it" memory, and
 * `wasRead` then answers false — the conservative side of that guard.
 */
function readSet(context: ProcessingContext): Set<string> | null {
  if (typeof context.get !== "function" || typeof context.set !== "function") {
    return null;
  }
  let set = context.get<Set<string>>(READ_TRACKER_KEY);
  if (!set) {
    set = new Set<string>();
    context.set(READ_TRACKER_KEY, set);
  }
  return set;
}

/**
 * The tracker's key for a path: the workspace's own normalized key, never the
 * string the model typed.
 *
 * `notes.md`, `./notes.md` and `/workspace/notes.md` are one file, and keying
 * on the spelling made `write_file` refuse a file the model had just read under
 * a different one — "exists but has not been read in this session", about a
 * file it was looking at. Falls back to the raw path only when the workspace
 * rejects it, where the caller is about to report that anyway.
 */
function trackerKey(workspace: Workspace, path: string): string {
  try {
    return workspace.key(path);
  } catch {
    return path;
  }
}

function markRead(
  context: ProcessingContext,
  workspace: Workspace,
  path: string
): void {
  readSet(context)?.add(trackerKey(workspace, path));
}

function wasRead(
  context: ProcessingContext,
  workspace: Workspace,
  path: string
): boolean {
  return readSet(context)?.has(trackerKey(workspace, path)) === true;
}

/**
 * Whether a path is a directory, for the tools that must not treat one as a
 * file.
 *
 * `exists` answers true for a directory and `read` answers null for one, so a
 * tool that asks only those two reports a state that cannot happen: the file is
 * there and its contents are missing. That is what sent an agent hunting for a
 * "ghost" file — it was the folder it had just created.
 */
async function isDirectory(
  workspace: Workspace,
  path: string
): Promise<boolean> {
  try {
    return (await workspace.stat(path))?.isDirectory === true;
  } catch {
    return false;
  }
}

function formatNumberedLines(content: string, startLine: number): string {
  const lines = content.split("\n");
  // Drop a single trailing empty line introduced by the split when content
  // ends with "\n" — matches `cat -n` behavior.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const width = String(startLine + lines.length - 1).length;
  return lines
    .map((line, i) => `${String(startLine + i).padStart(width, " ")}\t${line}`)
    .join("\n");
}

async function countTokens(text: string): Promise<number> {
  const { encodingForModel } = await import("js-tiktoken");
  const enc = encodingForModel(TOKEN_MODEL);
  return enc.encode(text).length;
}

function isBinaryBytes(bytes: Uint8Array): boolean {
  // Check first 8KB for null bytes — a strong indicator of binary content.
  const limit = Math.min(bytes.length, 8192);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

function getWorkspace(context: ProcessingContext): Workspace | null {
  return context.workspace ?? null;
}

const EXT_TO_MIME: Record<string, string> = {
  json: "application/json",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  tsv: "text/tab-separated-values; charset=utf-8",
  yaml: "application/yaml",
  yml: "application/yaml",
  js: "application/javascript",
  mjs: "application/javascript",
  cjs: "application/javascript",
  ts: "application/typescript",
  tsx: "application/typescript",
  jsx: "application/javascript",
  xml: "application/xml",
  svg: "image/svg+xml",
  toml: "application/toml",
  ini: "text/plain; charset=utf-8",
  log: "text/plain; charset=utf-8",
  txt: "text/plain; charset=utf-8"
};

function mimeForPath(path: string): string {
  const slash = path.lastIndexOf("/");
  const base = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "text/plain; charset=utf-8";
  const ext = base.slice(dot + 1).toLowerCase();
  return EXT_TO_MIME[ext] ?? "text/plain; charset=utf-8";
}

function isOutsideWorkspaceError(err: unknown): boolean {
  if (err instanceof Error && err.name === "WorkspacePathError") return true;
  const msg = err instanceof Error ? err.message : String(err);
  const lowered = msg.toLowerCase();
  return (
    lowered.includes("invalid storage key") ||
    lowered.includes("outside the workspace")
  );
}

const NO_WORKSPACE_ERROR =
  "Error: No workspace storage is configured for this context. File tools " +
  "require an environment that wires a workspace adapter (websocket server, " +
  "CLI). DSL/test contexts must set `workspaceStorage` explicitly.";

const readFileCapability: CapabilityExport = {
  spec: readFileCapabilitySpec,
  impl: async (run, params) => {
    const context = run.context;
    const filePath = params["file_path"];
    if (!isString(filePath)) {
      return "Error: file_path must be a string";
    }
    const workspace = getWorkspace(context);
    if (!workspace) return NO_WORKSPACE_ERROR;

    let bytes: Uint8Array | null;
    try {
      bytes = await workspace.read(filePath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return `Error: Path '${filePath}' is outside the workspace: ${msg}`;
    }
    if (!bytes) {
      if (await isDirectory(workspace, filePath)) {
        return `Error: ${filePath} is a directory, not a file. Use list_directory to see what is in it.`;
      }
      return `Error: ${filePath} does not exist`;
    }

    if (isBinaryBytes(bytes)) {
      return `Error: ${filePath} contains binary data and cannot be read as text`;
    }

    const raw = new TextDecoder("utf-8").decode(bytes);
    const allLines = raw.split("\n");
    const totalLines = allLines.length;

    const rawOffset = params["offset"];
    const rawLimit = params["limit"];
    const offset =
      isNumber(rawOffset) && rawOffset >= 1 ? Math.floor(rawOffset) : 1;
    const limit =
      isNumber(rawLimit) && rawLimit >= 1
        ? Math.floor(rawLimit)
        : DEFAULT_READ_LIMIT;

    if (offset > totalLines) {
      return `Error: offset ${offset} is beyond end of file (${totalLines} lines)`;
    }

    const startIdx = offset - 1;
    const endIdx = Math.min(totalLines, startIdx + limit);
    const slice = allLines.slice(startIdx, endIdx).join("\n");
    const truncated = slice.length > MAX_READ_CHARS;
    const content = truncated ? slice.slice(0, MAX_READ_CHARS) : slice;

    const tokenCount = await countTokens(content);
    if (tokenCount > MAX_TOKENS) {
      return (
        `Error: requested window (${endIdx - startIdx} lines) is ` +
        `${tokenCount} tokens, over the ${MAX_TOKENS}-token limit. ` +
        `Read a smaller range using offset/limit.`
      );
    }

    markRead(context, workspace, filePath);
    const numbered = formatNumberedLines(content, offset);
    if (truncated) {
      return (
        numbered +
        `\n\n[content truncated at ${MAX_READ_CHARS} characters; use offset/limit to read further]`
      );
    }
    if (endIdx < totalLines) {
      return (
        numbered +
        `\n\n[showing lines ${offset}-${endIdx} of ${totalLines}; use offset=${endIdx + 1} to continue]`
      );
    }
    return numbered;
  }
};

const writeFileCapability: CapabilityExport = {
  spec: writeFileCapabilitySpec,
  impl: async (run, params) => {
    const context = run.context;
    const filePath = params["file_path"];
    const content = params["content"];

    if (!isString(filePath)) {
      return "Error: file_path must be a string";
    }
    if (!isString(content)) {
      return "Error: content must be a string";
    }
    const workspace = getWorkspace(context);
    if (!workspace) return NO_WORKSPACE_ERROR;

    // Classify the path before writing: `exists` answers false for a path that
    // escapes, so without this the refusal would surface as a write failure.
    let existing;
    try {
      workspace.key(filePath);
      existing = await workspace.stat(filePath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return `Error: Path '${filePath}' is outside the workspace: ${msg}`;
    }
    // A directory is not an overwritable file. Answering "read it first" here
    // sent the model to read_file, which answers "does not exist" for the same
    // path — a contradiction it cannot act on.
    if (existing?.isDirectory) {
      return `Error: ${filePath} is a directory, not a file. Write to a path inside it instead.`;
    }
    const exists = existing !== null;
    if (exists && !wasRead(context, workspace, filePath)) {
      return (
        `Error: ${filePath} exists but has not been read in this session. ` +
        `Call read_file on it first so you know what you're overwriting.`
      );
    }

    try {
      await workspace.write(filePath, content, mimeForPath(filePath));
      // After a successful write, treat the file as "read" — the model knows
      // its current contents (it just wrote them) and shouldn't have to re-read
      // before the next overwrite.
      markRead(context, workspace, filePath);
      return exists ? `Updated ${filePath}` : `Created ${filePath}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return `Error: Failed to write ${filePath}: ${msg}`;
    }
  }
};

// ---------------------------------------------------------------------------
// list_directory
// ---------------------------------------------------------------------------

interface DirEntry {
  name: string;
  size: number;
  isDirectory: boolean;
}

/**
 * One directory level, or a formatted error string. Recurses into common
 * prefixes when asked; an errored subdirectory is skipped rather than failing
 * the whole listing.
 */
async function listEntries(
  context: ProcessingContext,
  rawPath: string,
  recursive: boolean
): Promise<DirEntry[] | string> {
  const workspace = getWorkspace(context);
  if (!workspace) return NO_WORKSPACE_ERROR;

  // "." and "/" both name the workspace root, which the interface spells "".
  const dirPath =
    rawPath === "." || rawPath === "/" || rawPath === "" ? "" : rawPath;

  let listed;
  try {
    listed = await workspace.list(dirPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isOutsideWorkspaceError(e)) {
      return `Error: Path '${rawPath}' is outside the workspace: ${msg}`;
    }
    return `Error: Failed to list '${rawPath}': ${msg}`;
  }

  // An empty listing is either an empty directory or a path that is not
  // there — only a stat tells them apart, and the difference matters to a
  // model deciding whether to create the file.
  if (listed.length === 0 && dirPath !== "") {
    try {
      if (!(await workspace.stat(dirPath))) {
        return `Error: '${rawPath}' not found`;
      }
    } catch (e) {
      if (isOutsideWorkspaceError(e)) {
        return `Error: Path '${rawPath}' is outside the workspace`;
      }
      const msg = e instanceof Error ? e.message : String(e);
      return `Error: Failed to list '${rawPath}': ${msg}`;
    }
  }

  const prefixToStrip = dirPath ? `${dirPath.replace(/\/+$/, "")}/` : "";
  const relative = (path: string): string =>
    prefixToStrip && path.startsWith(prefixToStrip)
      ? path.slice(prefixToStrip.length)
      : path;

  const entries: DirEntry[] = listed.map((entry) => ({
    name: relative(entry.path),
    size: entry.size,
    isDirectory: entry.isDirectory
  }));

  if (recursive) {
    for (const dir of listed.filter((entry) => entry.isDirectory)) {
      const subEntries = await listEntries(context, dir.path, true);
      if (isString(subEntries)) continue; // skip errored subdirs
      const subBase = dir.name;
      for (const child of subEntries) {
        entries.push({ ...child, name: `${subBase}/${child.name}` });
      }
    }
  }

  return entries;
}

const listDirectory: CapabilityExport = {
  spec: listDirectorySpec,
  impl: async (run, params) => {
    const context = run.context;
    const rawPath = params["path"];
    if (!isString(rawPath)) {
      return "Error: path must be a string";
    }
    const recursive = params["recursive"] === true;
    const entries = await listEntries(context, rawPath, recursive);
    if (isString(entries)) return entries; // error already formatted

    if (entries.length === 0) {
      return `(empty) ${rawPath || "."}`;
    }
    // Render as plain text: directories first, then files; trailing slash
    // marks dirs; size in bytes after the name.
    const dirs = entries.filter((e) => e.isDirectory);
    const files = entries.filter((e) => !e.isDirectory);
    const lines = [
      ...dirs.map((e) => `${e.name}/`),
      ...files.map((e) => `${e.name}\t${e.size} bytes`)
    ];
    return lines.join("\n");
  }
};

// ---------------------------------------------------------------------------
// Path safety — shared by edit_file, glob, grep
// ---------------------------------------------------------------------------

/**
 * Largest file grep will read into memory. The walk returns every non-binary
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
 * budget and per-line length cap in grep are the backstop for anything it
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
      after === "*" ||
      after === "+" ||
      (after === "{" && /\d/.test(pattern[j + 2] ?? ""));
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

const editFile: CapabilityExport = {
  spec: editFileSpec,
  impl: async (run, params) => {
    const context = run.context;
    const rawPath = params["path"];
    const oldString = params["old_string"];
    const newString = params["new_string"];
    const replaceAll = params["replace_all"] === true;

    if (!isString(rawPath))
      return { success: false, error: "path must be a string" };
    if (!isString(oldString))
      return { success: false, error: "old_string must be a string" };
    if (!isString(newString))
      return { success: false, error: "new_string must be a string" };
    if (oldString === newString)
      return {
        success: false,
        error: "old_string and new_string must be different"
      };

    const workspace = getWorkspace(context);
    if (!workspace) return { success: false, error: NO_WORKSPACE_ERROR };

    // Containment is the workspace's job — a key that would climb out is
    // rejected there, and a symlink cannot exist in an object store at all.
    // On a local workspace the storage layer resolves symlinks and refuses a
    // target whose real path leaves the root.
    let existing: string | null;
    try {
      existing = await workspace.readText(rawPath);
    } catch (e) {
      return {
        success: false,
        error: String(e instanceof Error ? e.message : e)
      };
    }

    // Empty old_string is the "create a new file" path. The file must not
    // already exist.
    if (oldString === "") {
      if (existing !== null) {
        return {
          success: false,
          error:
            "Cannot create new file — file already exists. Use a non-empty old_string to edit it."
        };
      }
      try {
        await workspace.write(rawPath, newString, mimeForPath(rawPath));
        markRead(context, workspace, rawPath);
        return { success: true, path: rawPath, created: true };
      } catch (e) {
        return {
          success: false,
          error: `Failed to create file: ${String(e)}`
        };
      }
    }

    if (existing === null) {
      if (await isDirectory(workspace, rawPath)) {
        return {
          success: false,
          error: `${rawPath} is a directory, not a file. Edit a file inside it instead.`
        };
      }
      return { success: false, error: `File not found: ${rawPath}` };
    }

    try {
      const content = existing;

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
          error:
            `old_string matches ${count} locations. Provide more surrounding context ` +
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
        if (newString === "" && !oldString.endsWith("\n")) {
          // Delete every occurrence, consuming a trailing newline PER match
          // where present. Switching the whole search string to oldString+"\n"
          // would silently skip occurrences that have no trailing newline (e.g.
          // "foo" inside "foobar"), leaving them behind while reporting them
          // removed. Two passes remove both forms; `count` still equals the
          // number of oldString occurrences actually deleted.
          newContent = content
            .split(oldString + "\n")
            .join("")
            .split(oldString)
            .join("");
        } else {
          newContent = content.split(oldString).join(newString);
        }
      } else {
        // Replace only first occurrence (searchString may consume its newline).
        const firstIdx = content.indexOf(searchString);
        newContent =
          content.slice(0, firstIdx) +
          newString +
          content.slice(firstIdx + searchString.length);
      }

      await workspace.write(rawPath, newContent, mimeForPath(rawPath));
      // An edit is a read plus a write: `write_file` must not go on to demand a
      // read of the file this call just showed the model and rewrote.
      markRead(context, workspace, rawPath);

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
};

/**
 * Every file at or under `dir`, as workspace paths.
 *
 * Replaces the old `walkDir`: the workspace's recursive listing is one call on
 * either backend, and it never sees a symlink — an object store cannot hold
 * one, and the local adapter refuses to follow one out of the root.
 */
async function walkWorkspace(
  workspace: Workspace,
  dir: string
): Promise<WorkspaceEntry[]> {
  const entries = await workspace.list(dir, { recursive: true });
  return entries.filter(
    (entry) => !entry.isDirectory && !isSkippedWalkPath(entry.path)
  );
}

/**
 * Directories glob and grep never descend into: `node_modules` and anything
 * hidden. A workspace holding a checkout is otherwise mostly dependencies, and
 * a search that returns them buries the files the user meant.
 */
function isSkippedWalkPath(path: string): boolean {
  return path
    .split("/")
    .slice(0, -1)
    .some((segment) => segment === "node_modules" || segment.startsWith("."));
}

/** Path of `file` relative to the searched directory. */
function relativeToSearch(searchDir: string, path: string): string {
  if (!searchDir) return path;
  const head = `${searchDir.replace(/\/+$/, "")}/`;
  return path.startsWith(head) ? path.slice(head.length) : path;
}

const glob: CapabilityExport = {
  spec: globSpec,
  impl: async (run, params) => {
    const context = run.context;
    const pattern = params["pattern"];
    const rawPath = params["path"];

    if (!isString(pattern))
      return { success: false, error: "pattern must be a string" };

    const workspace = getWorkspace(context);
    if (!workspace) return { success: false, error: NO_WORKSPACE_ERROR };

    let searchDir: string;
    try {
      const raw = isString(rawPath) ? rawPath : ".";
      searchDir = raw === "." || raw === "/" ? "" : workspace.key(raw);
    } catch (e) {
      return {
        success: false,
        error: String(e instanceof Error ? e.message : e)
      };
    }

    const LIMIT = 100;
    const start = Date.now();

    try {
      const allFiles = await walkWorkspace(workspace, searchDir);
      const regex = globToRegex(pattern);
      const matched = allFiles
        .map((entry) => ({
          path: relativeToSearch(searchDir, entry.path),
          mtime: entry.modifiedAt
        }))
        .filter((f) => regex.test(f.path));

      // Sort by modification time, most-recently-modified last, so the
      // freshest files land nearest the end of the list the model reads.
      matched.sort((a, b) => a.mtime - b.mtime || a.path.localeCompare(b.path));

      const truncated = matched.length > LIMIT;
      const files = matched.slice(0, LIMIT).map((m) => m.path);

      return {
        success: true,
        pattern,
        match_count: matched.length,
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
};

interface GrepMatch {
  file: string;
  line: number;
  content: string;
  context_before?: string[];
  context_after?: string[];
}

const grep: CapabilityExport = {
  spec: grepSpec,
  impl: async (run, params) => {
    const context = run.context;
    const pattern = params["pattern"];
    const rawPath = params["path"];
    const include = params["include"];
    const contextLines =
      isNumber(params["context"]) ? params["context"] : 0;
    const caseInsensitive = params["case_insensitive"] === true;
    const maxResults =
      isNumber(params["max_results"]) ? params["max_results"] : 100;

    if (!isString(pattern))
      return { success: false, error: "pattern must be a string" };

    const workspace = getWorkspace(context);
    if (!workspace) return { success: false, error: NO_WORKSPACE_ERROR };

    let searchDir: string;
    try {
      const raw = isString(rawPath) ? rawPath : ".";
      searchDir = raw === "." || raw === "/" ? "" : workspace.key(raw);
    } catch (e) {
      return {
        success: false,
        error: String(e instanceof Error ? e.message : e)
      };
    }

    if (
      hasNestedQuantifier(pattern) ||
      hasOverlappingAlternationQuantifier(pattern)
    ) {
      return {
        success: false,
        error:
          "Pattern rejected: it can cause catastrophic backtracking (a " +
          'quantifier applied to an already-quantified group like "(a+)+", or ' +
          'to a group with overlapping alternation branches like "(a|a)*"). ' +
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

    // A single file or a directory — the stat tells them apart, and a
    // workspace path that is neither is simply not there.
    let filesToSearch: WorkspaceEntry[];
    try {
      const info = searchDir ? await workspace.stat(searchDir) : null;
      if (info && !info.isDirectory) {
        filesToSearch = [
          {
            path: searchDir,
            name: searchDir.split("/").pop() ?? searchDir,
            size: info.size,
            modifiedAt: info.modifiedAt,
            isDirectory: false
          }
        ];
        // A single-file search reports paths relative to its own directory.
        searchDir = searchDir.slice(0, Math.max(0, searchDir.lastIndexOf("/")));
      } else if (info || searchDir === "") {
        filesToSearch = await walkWorkspace(workspace, searchDir);
      } else {
        return { success: false, error: `Path not found: ${rawPath ?? "."}` };
      }
    } catch (e) {
      // A path that resolves out of the workspace is a refusal, not a miss —
      // a symlink pointing at ~/.ssh must say so rather than read as absent.
      if (isOutsideWorkspaceError(e)) {
        return {
          success: false,
          error: `Path resolves outside the workspace: ${rawPath ?? "."}`
        };
      }
      return { success: false, error: `Path not found: ${rawPath ?? "."}` };
    }

    // Apply include filter
    if (isString(include)) {
      const includeRegex = globToRegex(include);
      filesToSearch = filesToSearch.filter((f) => {
        const rel = relativeToSearch(searchDir, f.path);
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
      const ext = f.path.slice(f.path.lastIndexOf(".")).toLowerCase();
      return !binaryExts.has(ext);
    });

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
      // decoded copy and a split array) into the shared process heap. The
      // listing already carries the size, so this costs no extra round trip —
      // which matters on an object store, where a stat is a network call.
      if (file.size > MAX_GREP_FILE_BYTES) continue;

      let content: string;
      try {
        const buf = await workspace.read(file.path);
        if (!buf) continue;
        // Skip binary files (null byte check)
        if (buf.subarray(0, 512).includes(0)) continue;
        content = new TextDecoder().decode(buf);
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
            file: relativeToSearch(searchDir, file.path),
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
};

// ---------------------------------------------------------------------------
// todo_write
// ---------------------------------------------------------------------------

const VALID_STATUSES: ReadonlySet<TodoStatus> = new Set<TodoStatus>([
  "pending",
  "in_progress",
  "completed"
]);

/** Module-level store: thread_id → latest TodoItem[]. */
const TODO_STORE = new Map<string, TodoItem[]>();

// Bound the store so a long-lived server (one thread id per chat session) can't
// leak an array per session forever. Nothing reliably calls clearThreadTodos on
// thread deletion, so evict the least-recently-written thread past this cap.
const TODO_STORE_MAX_THREADS = 1000;

function putThreadTodos(threadId: string, todos: TodoItem[]): void {
  // Re-insert to mark most-recently-used (Map preserves insertion order).
  TODO_STORE.delete(threadId);
  TODO_STORE.set(threadId, todos);
  while (TODO_STORE.size > TODO_STORE_MAX_THREADS) {
    const oldest = TODO_STORE.keys().next().value;
    if (oldest === undefined) break;
    TODO_STORE.delete(oldest);
  }
}

/**
 * Read the current todo list for a chat thread. Returns a defensive copy.
 * Other code (tests, server endpoints) can use this to hydrate UI state.
 */
export function getThreadTodos(threadId: string): TodoItem[] {
  const list = TODO_STORE.get(threadId);
  return list ? list.map((t) => ({ ...t })) : [];
}

/** Clear all todos for a thread (e.g. on thread delete). */
export function clearThreadTodos(threadId: string): void {
  TODO_STORE.delete(threadId);
}

/** Test-only — wipe the global store. */
export function _resetTodoStoreForTests(): void {
  TODO_STORE.clear();
}

function normalizeTodos(raw: unknown): TodoItem[] {
  if (!Array.isArray(raw)) {
    throw new Error("`todos` must be an array");
  }
  return raw.map((item, i) => {
    if (!isObjectLike(item)) {
      throw new Error(`todos[${i}] must be an object`);
    }
    const rec = item;
    const content = rec.content;
    const status = rec.status;
    if (!isNonBlankString(content)) {
      throw new Error(`todos[${i}].content must be a non-empty string`);
    }
    if (!isString(status) || !VALID_STATUSES.has(status as TodoStatus)) {
      throw new Error(
        `todos[${i}].status must be one of: pending, in_progress, completed`
      );
    }
    return { content: content.trim(), status: status as TodoStatus };
  });
}

const todoWrite: CapabilityExport = {
  spec: todoWriteSpec,
  impl: async (run, params) => {
    const context = run.context;
    const todos = normalizeTodos(params["todos"]);

    const threadId = context.threadId;
    if (threadId) {
      putThreadTodos(
        threadId,
        todos.map((t) => ({ ...t }))
      );
    }

    const update: TodoUpdate = {
      type: "todo_update",
      thread_id: threadId ?? null,
      workflow_id: context.workflowId ?? null,
      todos: todos.map((t) => ({ ...t }))
    };
    context.postMessage(update);

    const counts = todos.reduce(
      (acc, t) => {
        acc[t.status] += 1;
        return acc;
      },
      { pending: 0, in_progress: 0, completed: 0 }
    );

    return {
      ok: true,
      total: todos.length,
      counts,
      todos
    };
  }
};

/** Every files capability, in the order the tool classes were listed. */
export const FILE_CAPABILITIES: readonly CapabilityExport[] = [
  readFileCapability,
  writeFileCapability,
  listDirectory,
  editFile,
  glob,
  grep,
  todoWrite
];

export const module: CapabilityModule = {
  module: "files",
  exports: FILE_CAPABILITIES
};

export {
  readFileCapability,
  writeFileCapability,
  listDirectory,
  editFile,
  glob,
  grep,
  todoWrite
};
