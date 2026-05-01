/**
 * Workspace-scoped file tools — T-AG-1.
 *
 * Read, write, and list files relative to a workspace root directory.
 * All paths are sandboxed to prevent traversal outside the workspace.
 */
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  stat,
  access
} from "node:fs/promises";
import { resolve, join, basename, dirname } from "node:path";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";

function resolveSandboxed(workspaceRoot: string, userPath: string): string {
  const root = resolve(workspaceRoot);
  const resolved = resolve(root, userPath);
  if (!resolved.startsWith(root + "/") && resolved !== root) {
    throw new Error("Path traversal not allowed");
  }
  return resolved;
}

export class WorkspaceReadTool extends Tool {
  readonly name = "workspace_read";
  readonly description = "Read a file relative to the agent workspace root.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description: "File path relative to workspace"
      }
    },
    required: ["path"]
  };

  private workspaceRoot: string;
  constructor(workspaceRoot: string) {
    super();
    this.workspaceRoot = workspaceRoot;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const rawPath = params.path;
    if (typeof rawPath !== "string")
      return { success: false, error: "path must be a string" };

    let filePath: string;
    try {
      filePath = resolveSandboxed(this.workspaceRoot, rawPath);
    } catch {
      return { success: false, error: "Path traversal not allowed" };
    }

    try {
      await access(filePath);
      const content = await readFile(filePath, "utf-8");
      return { success: true, path: rawPath, content };
    } catch {
      return { success: false, error: `File not found: ${rawPath}` };
    }
  }
}

export class WorkspaceWriteTool extends Tool {
  readonly name = "workspace_write";
  readonly description = "Write a file relative to the agent workspace root.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description: "File path relative to workspace"
      },
      content: { type: "string" as const, description: "Content to write" }
    },
    required: ["path", "content"]
  };

  private workspaceRoot: string;
  constructor(workspaceRoot: string) {
    super();
    this.workspaceRoot = workspaceRoot;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const rawPath = params.path;
    const content = params.content;
    if (typeof rawPath !== "string")
      return { success: false, error: "path must be a string" };
    if (typeof content !== "string")
      return { success: false, error: "content must be a string" };

    let filePath: string;
    try {
      filePath = resolveSandboxed(this.workspaceRoot, rawPath);
    } catch {
      return { success: false, error: "Path traversal not allowed" };
    }

    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
      return { success: true, path: rawPath };
    } catch (e) {
      return {
        success: false,
        error: `Failed to write: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
}

export class WorkspaceListTool extends Tool {
  readonly name = "workspace_list";
  readonly description =
    "List directory contents relative to the agent workspace root.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description: "Directory path relative to workspace"
      }
    },
    required: ["path"]
  };

  private workspaceRoot: string;
  constructor(workspaceRoot: string) {
    super();
    this.workspaceRoot = workspaceRoot;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const rawPath = params.path;
    if (typeof rawPath !== "string")
      return { success: false, error: "path must be a string" };

    let dirPath: string;
    try {
      dirPath = resolveSandboxed(this.workspaceRoot, rawPath);
    } catch {
      return { success: false, error: "Path traversal not allowed" };
    }

    try {
      const dirEntries = await readdir(dirPath, { withFileTypes: true });
      const entries = await Promise.all(
        dirEntries.map(async (entry) => {
          let size = 0;
          try {
            const info = await stat(join(dirPath, entry.name));
            size = info.size;
          } catch {
            /* ignore */
          }
          return { name: entry.name, size, is_dir: entry.isDirectory() };
        })
      );
      return { success: true, entries };
    } catch {
      return { success: false, error: `Directory not found: ${rawPath}` };
    }
  }
}
