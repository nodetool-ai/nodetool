/**
 * Filesystem tools — backed by `context.workspaceStorage` so the agent's
 * file I/O is abstracted behind {@link StorageAdapter}. Local FS, S3, and
 * Supabase backends all expose the same tool surface.
 *
 * Tool shape:
 *   - `file_path` is the canonical arg name (workspace-relative storage key
 *     here, not an absolute filesystem path — the workspace adapter handles
 *     resolution against the configured root).
 *   - Read returns numbered text (`cat -n` format) so the model can refer to
 *     line numbers when editing.
 *   - Write refuses to overwrite a file that wasn't read first in this
 *     session — protects against blind clobbers.
 *   - Successful results are plain strings, not `{success: true, ...}` envelopes.
 *     Errors return `Error: <message>` strings so the model parses them
 *     consistently with every other tool failure.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { Tool } from "./base-tool.js";

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

function formatNumberedLines(
  content: string,
  startLine: number
): string {
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

export class ReadFileTool extends Tool {
  readonly name = "read_file";
  readonly description =
    "Reads a text file from the agent workspace. Returns the file contents " +
    "with line numbers in `cat -n` format. By default reads up to 2000 " +
    "lines from the start. Use `offset` and `limit` to read a specific " +
    "window. Cannot read binary files. Paths are workspace-relative storage " +
    "keys; the workspace adapter handles backend resolution (local FS, S3, " +
    "Supabase).";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      file_path: {
        type: "string" as const,
        description:
          "Workspace-relative path to the file (POSIX-style)."
      },
      offset: {
        type: "number" as const,
        description:
          "1-indexed line number to start reading from. Defaults to 1."
      },
      limit: {
        type: "number" as const,
        description:
          "Number of lines to read. Defaults to 2000."
      }
    },
    required: ["file_path"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const filePath = params["file_path"];
    if (typeof filePath !== "string") {
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
      typeof rawOffset === "number" && rawOffset >= 1
        ? Math.floor(rawOffset)
        : 1;
    const limit =
      typeof rawLimit === "number" && rawLimit >= 1
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

  userMessage(params: Record<string, unknown>): string {
    const path = params["file_path"];
    const msg = `Reading ${path}`;
    return msg.length > 80 ? "Reading a file" : msg;
  }
}

export class WriteFileTool extends Tool {
  readonly name = "write_file";
  readonly description =
    "Writes a file in the agent workspace. Overwrites the file if it " +
    "exists. If the file already exists, you MUST call `read_file` on it " +
    "first in this session so you know what you're about to replace. New " +
    "files don't require a prior read. Paths are workspace-relative storage " +
    "keys.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      file_path: {
        type: "string" as const,
        description: "Workspace-relative path to the file to write."
      },
      content: {
        type: "string" as const,
        description: "Full content to write to the file."
      }
    },
    required: ["file_path", "content"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const filePath = params["file_path"];
    const content = params["content"];

    if (typeof filePath !== "string") {
      return "Error: file_path must be a string";
    }
    if (typeof content !== "string") {
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
      return exists
        ? `Updated ${filePath}`
        : `Created ${filePath}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return `Error: Failed to write ${filePath}: ${msg}`;
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const path = params["file_path"] ?? "";
    const msg = `Writing ${path}`;
    return msg.length > 160 ? "Writing a file" : msg;
  }
}

interface DirEntry {
  name: string;
  size: number;
  isDirectory: boolean;
}

export class ListDirectoryTool extends Tool {
  readonly name = "list_directory";
  readonly description =
    "Lists files and subdirectories in a workspace directory. Returns one " +
    "entry per line: directories end with `/`, files show their size in " +
    "bytes after the name. Use `path: \".\"` to list the workspace root.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description:
          "Workspace-relative directory path. Use `.` for the workspace root."
      },
      recursive: {
        type: "boolean" as const,
        description:
          "Walk subdirectories. Defaults to false."
      }
    },
    required: ["path"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const rawPath = params["path"];
    if (typeof rawPath !== "string") {
      return "Error: path must be a string";
    }
    const storage = getStorage(context);
    if (!storage) return NO_WORKSPACE_ERROR;

    const recursive = params["recursive"] === true;
    const entries = await this.listEntries(context, rawPath, recursive);
    if (typeof entries === "string") return entries; // error already formatted

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

  private async listEntries(
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
        const subEntries = await this.listEntries(context, subKey, true);
        if (typeof subEntries === "string") continue; // skip errored subdirs
        const subBase = subKey.split("/").pop() ?? subKey;
        for (const child of subEntries) {
          entries.push({ ...child, name: `${subBase}/${child.name}` });
        }
      }
    }

    return entries;
  }

  userMessage(params: Record<string, unknown>): string {
    return `Listing ${String(params["path"] ?? ".")}`;
  }
}
