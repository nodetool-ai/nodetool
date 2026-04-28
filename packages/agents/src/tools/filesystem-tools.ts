/**
 * Filesystem tools for reading, writing, and listing files.
 *
 * Port of src/nodetool/agents/tools/workspace_tools.py
 */

import {
  readFile,
  writeFile,
  appendFile,
  mkdir,
  readdir,
  stat,
  access
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ProcessingContext } from "@nodetool/runtime";
import { Tool } from "./base-tool.js";

const MAX_READ_CHARS = 100_000;
const MAX_TOKENS = 25_000;
const TOKEN_MODEL = "gpt-4" as const;

async function countTokens(text: string): Promise<number> {
  const { encodingForModel } = await import("js-tiktoken");
  const enc = encodingForModel(TOKEN_MODEL);
  return enc.encode(text).length;
}

function isBinaryBuffer(buf: Buffer): boolean {
  // Check first 8KB for null bytes — a strong indicator of binary content
  const check = buf.subarray(0, 8192);
  for (let i = 0; i < check.length; i++) {
    if (check[i] === 0) return true;
  }
  return false;
}

function resolveSafePath(context: ProcessingContext, rawPath: string): string {
  return context.resolveWorkspacePath(rawPath);
}

export class ReadFileTool extends Tool {
  readonly name = "read_file";
  readonly description =
    "Read the contents of a text file within the agent workspace. Automatically counts tokens and supports reading specific line ranges. Cannot read binary files.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description:
          "Path to the file to read, relative to the workspace directory"
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

    let filePath: string;
    try {
      filePath = resolveSafePath(context, rawPath);
    } catch (e) {
      return {
        success: false,
        error: String(e instanceof Error ? e.message : e)
      };
    }

    try {
      await access(filePath);
    } catch {
      return {
        success: false,
        error: `Path ${rawPath} does not exist`
      };
    }

    // Binary detection
    try {
      const rawBuf = await readFile(filePath);
      if (isBinaryBuffer(rawBuf)) {
        return {
          success: false,
          is_binary: true,
          path: rawPath,
          full_path: filePath,
          error: `The file ${rawPath} contains binary data that cannot be processed`
        };
      }

      const raw = rawBuf.toString("utf-8");

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
            full_path: filePath,
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
          full_path: filePath,
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
        full_path: filePath,
        content,
        truncated: raw.length > MAX_READ_CHARS,
        is_binary: false,
        line_info: lineInfo,
        token_info: tokenInfo
      };
    } catch (e) {
      return {
        success: false,
        error: `Failed to read file: ${String(e)}`
      };
    }
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
    "Write content to a file in the agent workspace, creating it if it doesn't exist.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description:
          "Path to the file to write, relative to the workspace directory"
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

    let filePath: string;
    try {
      filePath = resolveSafePath(context, rawPath);
    } catch (e) {
      return {
        success: false,
        error: String(e instanceof Error ? e.message : e)
      };
    }

    try {
      await mkdir(dirname(filePath), { recursive: true });

      let created: boolean;
      try {
        await access(filePath);
        created = false;
      } catch {
        created = true;
      }

      if (appendMode) {
        await appendFile(filePath, content, "utf-8");
      } else {
        await writeFile(filePath, content, "utf-8");
      }

      return {
        success: true,
        path: rawPath,
        full_path: filePath,
        append: appendMode,
        created
      };
    } catch (e) {
      return { success: false, error: `Failed to write file: ${String(e)}` };
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
    "List the contents (files and subdirectories) of a directory within the agent workspace.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description:
          "Path to the directory to list, relative to the workspace directory"
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

    let dirPath: string;
    try {
      dirPath = resolveSafePath(context, rawPath);
    } catch (e) {
      return {
        success: false,
        error: String(e instanceof Error ? e.message : e)
      };
    }

    const recursive = params["recursive"] === true;
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      const results: DirEntry[] = [];
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        try {
          const info = await stat(fullPath);
          results.push({
            name: entry.name,
            size: info.size,
            isDirectory: entry.isDirectory()
          });
        } catch {
          results.push({
            name: entry.name,
            size: 0,
            isDirectory: entry.isDirectory()
          });
        }
      }
      if (recursive) {
        const subdirs = results.filter((e) => e.isDirectory);
        for (const sub of subdirs) {
          const subResult = (await this.process(context, {
            path: join(rawPath, sub.name),
            recursive: true
          })) as { entries?: DirEntry[] };
          if (subResult.entries) {
            for (const child of subResult.entries) {
              results.push({
                ...child,
                name: `${sub.name}/${child.name}`
              });
            }
          }
        }
      }
      return { entries: results };
    } catch (e) {
      return { error: `Failed to list directory: ${String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Listing directory: ${String(params["path"] ?? "")}`;
  }
}
