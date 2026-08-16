/**
 * The `files` capability module — the workspace namespace.
 *
 * Seven capabilities that used to be seven `Tool` subclasses across three
 * files: `read_file`, `write_file` and `list_directory` (`filesystem-tools.ts`,
 * backed by `context.workspaceStorage`), `edit_file`, `glob` and `grep`
 * (`edit-search-tools.ts`, backed by the resolved workspace path), and
 * `todo_write` (`todo-tools.ts`, the per-thread checklist).
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

import {
  access,
  lstat,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import type { JsonSchema, ProcessingContext } from "@nodetool-ai/runtime";
import type { StorageAdapter } from "@nodetool-ai/storage";
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

function readSet(context: ProcessingContext): Set<string> {
  let set = context.get<Set<string>>(READ_TRACKER_KEY);
  if (!set) {
    set = new Set<string>();
    context.set(READ_TRACKER_KEY, set);
  }
  return set;
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

function getStorage(context: ProcessingContext): StorageAdapter | null {
  return context.workspaceStorage ?? null;
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

function isInvalidStorageKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.toLowerCase().includes("invalid storage key");
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
    const storage = getStorage(context);
    if (!storage) return NO_WORKSPACE_ERROR;

    let uri: string;
    try {
      uri = storage.uriForKey(filePath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return `Error: Path '${filePath}' is outside the workspace: ${msg}`;
    }
    const bytes = await storage.retrieve(uri);
    if (!bytes) {
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

    readSet(context).add(filePath);
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
    const storage = getStorage(context);
    if (!storage) return NO_WORKSPACE_ERROR;

    let uri: string;
    try {
      uri = storage.uriForKey(filePath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return `Error: Path '${filePath}' is outside the workspace: ${msg}`;
    }

    const exists = await storage.exists(uri);
    if (exists && !readSet(context).has(filePath)) {
      return (
        `Error: ${filePath} exists but has not been read in this session. ` +
        `Call read_file on it first so you know what you're overwriting.`
      );
    }

    try {
      const bytes = new TextEncoder().encode(content);
      await storage.store(filePath, bytes, mimeForPath(filePath));
      // After a successful write, treat the file as "read" — the model knows
      // its current contents (it just wrote them) and shouldn't have to re-read
      // before the next overwrite.
      readSet(context).add(filePath);
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
  const storage = getStorage(context);
  if (!storage) return NO_WORKSPACE_ERROR;

  // Normalize "." and "/" to the empty prefix (workspace root). The
  // storage layer's normalizeStorageKey rejects "." as invalid.
  const listPrefix =
    rawPath === "." || rawPath === "/" || rawPath === "" ? "" : rawPath;

  let result;
  try {
    result = await storage.list(listPrefix, { delimiter: "/" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isInvalidStorageKeyError(e)) {
      return `Error: Path '${rawPath}' is outside the workspace: ${msg}`;
    }
    return `Error: Failed to list '${rawPath}': ${msg}`;
  }
  if (
    result.entries.length === 0 &&
    result.commonPrefixes.length === 0 &&
    listPrefix !== ""
  ) {
    let stillExists = false;
    try {
      stillExists = await storage.exists(storage.uriForKey(listPrefix));
    } catch (e) {
      if (isInvalidStorageKeyError(e)) {
        return `Error: Path '${rawPath}' is outside the workspace`;
      }
      const msg = e instanceof Error ? e.message : String(e);
      return `Error: Failed to list '${rawPath}': ${msg}`;
    }
    if (!stillExists) {
      return `Error: '${rawPath}' not found`;
    }
  }
  const entries: DirEntry[] = [];
  const prefixToStrip = rawPath ? `${rawPath.replace(/\/+$/, "")}/` : "";

  for (const entry of result.entries) {
    const name = prefixToStrip
      ? entry.key.startsWith(prefixToStrip)
        ? entry.key.slice(prefixToStrip.length)
        : entry.key
      : entry.key;
    entries.push({ name, size: entry.size, isDirectory: false });
  }
  for (const cp of result.commonPrefixes) {
    const trimmed = cp.replace(/\/+$/, "");
    const name = prefixToStrip
      ? trimmed.startsWith(prefixToStrip.replace(/\/+$/, ""))
        ? trimmed.slice(prefixToStrip.length).replace(/^\/+/, "")
        : trimmed
      : trimmed;
    const lastSegment = name.split("/").pop() ?? name;
    entries.push({ name: lastSegment, size: 0, isDirectory: true });
  }

  if (recursive) {
    for (const cp of result.commonPrefixes) {
      const subKey = cp.replace(/\/+$/, "");
      const subEntries = await listEntries(context, subKey, true);
      if (isString(subEntries)) continue; // skip errored subdirs
      const subBase = subKey.split("/").pop() ?? subKey;
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
    const storage = getStorage(context);
    if (!storage) return NO_WORKSPACE_ERROR;

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
          error:
            "Cannot create new file — file already exists. Use a non-empty old_string to edit it."
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
};

const glob: CapabilityExport = {
  spec: globSpec,
  impl: async (run, params) => {
    const context = run.context;
    const pattern = params["pattern"];
    const rawPath = params["path"];

    if (!isString(pattern))
      return { success: false, error: "pattern must be a string" };

    let searchDir: string;
    try {
      searchDir = resolveSafePath(
        context,
        isString(rawPath) ? rawPath : "."
      );
    } catch (e) {
      return {
        success: false,
        error: String(e instanceof Error ? e.message : e)
      };
    }

    // walkDir skips symlink entries, but readdir transparently follows a
    // symlinked search root itself, so realpath-verify it stays in the
    // workspace before walking (mirrors grep).
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
      withMtime.sort(
        (a, b) => a.mtime - b.mtime || a.path.localeCompare(b.path)
      );

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

    let searchDir: string;
    try {
      searchDir = resolveSafePath(
        context,
        isString(rawPath) ? rawPath : "."
      );
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
    if (isString(include)) {
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
