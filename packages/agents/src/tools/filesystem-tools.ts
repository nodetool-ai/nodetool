/**
 * Filesystem tools — backed by `context.workspaceStorage` so the agent's
 * file I/O is abstracted behind {@link StorageAdapter}. Local FS, S3, and
 * Supabase backends all expose the same tool surface.
 *
 * `path` parameters are storage keys (POSIX-style relative paths). For the
 * local FS backend they map to files under the workspace root; for cloud
 * backends they map to object keys with a workspace prefix.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { Tool } from "./base-tool.js";

const MAX_READ_CHARS = 100_000;
const MAX_TOKENS = 25_000;
const TOKEN_MODEL = "gpt-4" as const;

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

const NO_WORKSPACE_ERROR = {
  success: false,
  error:
    "No workspace storage is configured for this context. File-tool calls " +
    "are only supported in environments where the runtime wires a " +
    "workspace adapter (websocket server, CLI). DSL/test contexts must set " +
    "`workspaceStorage` explicitly."
} as const;

export class ReadFileTool extends Tool {
  readonly name = "read_file";
  readonly description =
    "Read the contents of a text file in the agent workspace. Routed " +
    "through the workspace storage adapter so this works against local FS " +
    "and cloud (S3/Supabase) backends identically. Counts tokens and " +
    "supports reading specific line ranges. Cannot read binary files.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description:
          "Storage key of the file to read (POSIX-style relative path)."
      },
      start_line: {
        type: "number" as const,
        description: "Start line (1-indexed, optional)"
      },
      end_line: {
        type: "number" as const,
        description: "End line (1-indexed, inclusive, optional)"
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
      return { error: "path must be a string" };
    }
    const storage = getStorage(context);
    if (!storage) return NO_WORKSPACE_ERROR;

    let uri: string;
    try {
      uri = storage.uriForKey(rawPath);
    } catch (e) {
      return {
        success: false,
        error: `Path '${rawPath}' is outside the workspace: ${e instanceof Error ? e.message : String(e)}`
      };
    }
    const bytes = await storage.retrieve(uri);
    if (!bytes) {
      return {
        success: false,
        error: `Path ${rawPath} does not exist`
      };
    }

    if (isBinaryBytes(bytes)) {
      return {
        success: false,
        is_binary: true,
        path: rawPath,
        error: `The file ${rawPath} contains binary data that cannot be processed`
      };
    }

    const raw = new TextDecoder("utf-8").decode(bytes);

    const startLine = params["start_line"];
    const endLine = params["end_line"];
    let content: string;
    let lineInfo: Record<string, number>;

    if (typeof startLine === "number" || typeof endLine === "number") {
      const lines = raw.split("\n");
      const totalLines = lines.length;
      const startIdx = Math.max(
        0,
        (typeof startLine === "number" ? startLine : 1) - 1
      );
      const endIdx = Math.min(
        totalLines,
        typeof endLine === "number" ? endLine : totalLines
      );

      if (startIdx >= totalLines || startIdx > endIdx) {
        return {
          success: false,
          is_directory: false,
          path: rawPath,
          error: `Invalid line range: start_line=${startLine}, end_line=${endLine}, total lines=${totalLines}`,
          suggested_ranges: [
            `1-${Math.min(500, totalLines)}`,
            `${Math.max(1, totalLines - 500)}-${totalLines}`
          ]
        };
      }

      content = lines.slice(startIdx, endIdx).join("\n");
      lineInfo = {
        start_line: typeof startLine === "number" ? startLine : 1,
        end_line: endIdx,
        total_lines: totalLines
      };
    } else {
      content =
        raw.length > MAX_READ_CHARS ? raw.slice(0, MAX_READ_CHARS) : raw;
      lineInfo = { total_lines: (raw.match(/\n/g) || []).length + 1 };
    }

    const tokenCount = await countTokens(content);
    const tokenInfo = { count: tokenCount, model: TOKEN_MODEL };

    if (tokenCount > MAX_TOKENS) {
      const totalLines = lineInfo.total_lines ?? 0;
      const approxLinesPerToken = totalLines / Math.max(1, tokenCount);
      const suggestedLineCount = Math.floor(
        approxLinesPerToken * MAX_TOKENS * 0.9
      );

      let suggestedRanges: string[];
      if (typeof startLine === "number") {
        const suggestedEnd = Math.min(
          startLine + suggestedLineCount - 1,
          totalLines
        );
        suggestedRanges = [`${startLine}-${suggestedEnd}`];
      } else {
        const chunkSize = Math.min(suggestedLineCount, 500);
        suggestedRanges = [];
        for (
          let i = 1;
          i <= totalLines && suggestedRanges.length < 3;
          i += chunkSize
        ) {
          suggestedRanges.push(
            `${i}-${Math.min(i + chunkSize - 1, totalLines)}`
          );
        }
      }

      return {
        success: false,
        is_directory: false,
        path: rawPath,
        error: `Token count (${tokenCount}) exceeds maximum (${MAX_TOKENS}). Please read only a portion of the file.`,
        token_info: tokenInfo,
        line_info: lineInfo,
        suggested_ranges: suggestedRanges
      };
    }

    return {
      success: true,
      is_directory: false,
      path: rawPath,
      content,
      truncated: raw.length > MAX_READ_CHARS,
      is_binary: false,
      line_info: lineInfo,
      token_info: tokenInfo
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const path = params["path"];
    const msg = `Reading content from ${path}...`;
    return msg.length > 80 ? "Reading content from a path..." : msg;
  }
}

export class WriteFileTool extends Tool {
  readonly name = "write_file";
  readonly description =
    "Write content to a file in the agent workspace, creating it if it " +
    "doesn't exist. Routed through the workspace storage adapter (local FS " +
    "or cloud).";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description: "Storage key of the file to write."
      },
      content: {
        type: "string" as const,
        description: "Content to write to the file"
      },
      append: {
        type: "boolean" as const,
        description: "Whether to append to the file instead of overwriting",
        default: false
      }
    },
    required: ["path", "content"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const rawPath = params["path"];
    const content = params["content"];
    const appendMode = params["append"] === true;

    if (typeof rawPath !== "string") {
      return { error: "path must be a string" };
    }
    if (typeof content !== "string") {
      return { error: "content must be a string" };
    }
    const storage = getStorage(context);
    if (!storage) return NO_WORKSPACE_ERROR;

    let uri: string;
    try {
      uri = storage.uriForKey(rawPath);
    } catch (e) {
      return {
        success: false,
        error: `Path '${rawPath}' is outside the workspace: ${e instanceof Error ? e.message : String(e)}`
      };
    }
    let created = true;
    let payload = content;
    if (appendMode) {
      const existing = await storage.retrieve(uri);
      if (existing) {
        created = false;
        payload = new TextDecoder("utf-8").decode(existing) + content;
      }
    } else {
      created = !(await storage.exists(uri));
    }

    try {
      const bytes = new TextEncoder().encode(payload);
      await storage.store(rawPath, bytes, "text/plain; charset=utf-8");
      return {
        success: true,
        path: rawPath,
        append: appendMode,
        created
      };
    } catch (e) {
      return {
        success: false,
        error: `Failed to write file: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const path = params["path"] ?? "";
    const appendMode = params["append"] === true;
    const action = appendMode ? "Appending to" : "Writing to";
    const msg = `${action} file ${path}...`;
    return msg.length > 160 ? `${action} a file...` : msg;
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
    "List the contents (files and subdirectories) of a directory in the " +
    "agent workspace. Routed through the workspace storage adapter.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description: "Storage key prefix of the directory to list."
      },
      recursive: {
        type: "boolean" as const,
        description: "Whether to list contents recursively (default false)"
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
      return { error: "path must be a string" };
    }
    const storage = getStorage(context);
    if (!storage) return NO_WORKSPACE_ERROR;

    const recursive = params["recursive"] === true;
    // Normalize "." and "/" to the empty prefix (workspace root). The
    // storage layer's normalizeStorageKey rejects "." as invalid, but the
    // semantic intent here is "list root."
    const listPrefix =
      rawPath === "." || rawPath === "/" || rawPath === "" ? "" : rawPath;

    let result;
    try {
      result = await storage.list(listPrefix, { delimiter: "/" });
    } catch (e) {
      return {
        success: false,
        error: `Path '${rawPath}' is outside the workspace: ${e instanceof Error ? e.message : String(e)}`
      };
    }
    if (
      result.entries.length === 0 &&
      result.commonPrefixes.length === 0 &&
      listPrefix !== ""
    ) {
      // Match legacy behavior: non-existent directory returns an error.
      let stillExists = false;
      try {
        stillExists = await storage.exists(storage.uriForKey(listPrefix));
      } catch {
        return {
          success: false,
          error: `Path '${rawPath}' is outside the workspace`
        };
      }
      if (!stillExists) {
        return { error: `Failed to list directory: '${rawPath}' not found` };
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
      // Legacy parity: the FS-based ListDirectoryTool reported size 0 when
      // stat() failed (e.g. broken symlink). Storage entries already filter
      // unreadable items, so just emit normally — broken symlinks won't
      // appear in entries because fs-safe rejects them; surface them as
      // size: 0 dir-style entries is no longer possible. Tests that rely on
      // this should treat absence as expected.
      entries.push({ name, size: entry.size, isDirectory: false });
    }
    for (const cp of result.commonPrefixes) {
      const trimmed = cp.replace(/\/+$/, "");
      const name = prefixToStrip
        ? trimmed.startsWith(prefixToStrip.replace(/\/+$/, ""))
          ? trimmed.slice(prefixToStrip.length).replace(/^\/+/, "")
          : trimmed
        : trimmed;
      // Last path segment only — match the legacy FS readdir behavior.
      const lastSegment = name.split("/").pop() ?? name;
      entries.push({
        name: lastSegment,
        size: 0,
        isDirectory: true
      });
    }

    if (recursive) {
      for (const cp of result.commonPrefixes) {
        const subKey = cp.replace(/\/+$/, "");
        const subResult = (await this.process(context, {
          path: subKey,
          recursive: true
        })) as { entries?: DirEntry[] };
        if (subResult.entries) {
          const subBase = subKey.split("/").pop() ?? subKey;
          for (const child of subResult.entries) {
            entries.push({
              ...child,
              name: `${subBase}/${child.name}`
            });
          }
        }
      }
    }

    return { entries };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Listing directory: ${String(params["path"] ?? "")}`;
  }
}
