/**
 * Workspace-scoped file tools — T-AG-1.
 *
 * Read, write, and list files relative to the agent's workspace storage
 * adapter (`context.workspaceStorage`). Local FS, S3, and Supabase
 * backends all expose the same surface — these tools no longer touch the
 * filesystem directly.
 *
 * The constructor still accepts a `workspaceRoot` argument for backward
 * compatibility with existing call sites, but it is unused: routing is
 * driven by `context.workspaceStorage` instead.
 */
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { Tool } from "./base-tool.js";

function getStorage(context: ProcessingContext): StorageAdapter | null {
  return context.workspaceStorage ?? null;
}

const NO_WORKSPACE_ERROR = {
  success: false,
  error: "No workspace storage configured for this context."
} as const;

export class WorkspaceReadTool extends Tool {
  readonly name = "workspace_read";
  readonly description = "Read a file relative to the agent workspace.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description: "File path (storage key) relative to workspace"
      }
    },
    required: ["path"]
  };

  // Kept for API compat; no longer consulted.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_workspaceRoot?: string) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const rawPath = params.path;
    if (typeof rawPath !== "string")
      return { success: false, error: "path must be a string" };

    const storage = getStorage(context);
    if (!storage) return NO_WORKSPACE_ERROR;

    let bytes: Uint8Array | null;
    try {
      bytes = await storage.retrieve(storage.uriForKey(rawPath));
    } catch {
      return { success: false, error: "Path traversal not allowed" };
    }
    if (!bytes) return { success: false, error: `File not found: ${rawPath}` };
    return {
      success: true,
      path: rawPath,
      content: new TextDecoder("utf-8").decode(bytes)
    };
  }
}

export class WorkspaceWriteTool extends Tool {
  readonly name = "workspace_write";
  readonly description = "Write a file relative to the agent workspace.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description: "File path (storage key) relative to workspace"
      },
      content: { type: "string" as const, description: "Content to write" }
    },
    required: ["path", "content"]
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_workspaceRoot?: string) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const rawPath = params.path;
    const content = params.content;
    if (typeof rawPath !== "string")
      return { success: false, error: "path must be a string" };
    if (typeof content !== "string")
      return { success: false, error: "content must be a string" };

    const storage = getStorage(context);
    if (!storage) return NO_WORKSPACE_ERROR;

    try {
      await storage.store(
        rawPath,
        new TextEncoder().encode(content),
        "text/plain; charset=utf-8"
      );
      return { success: true, path: rawPath };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // The storage layer rejects `..` traversal at normalizeStorageKey.
      if (msg.toLowerCase().includes("invalid storage key") || msg.includes("..")) {
        return { success: false, error: "Path traversal not allowed" };
      }
      return { success: false, error: `Failed to write: ${msg}` };
    }
  }
}

export class WorkspaceListTool extends Tool {
  readonly name = "workspace_list";
  readonly description =
    "List directory contents relative to the agent workspace.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description: "Directory path (storage key prefix)"
      }
    },
    required: ["path"]
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_workspaceRoot?: string) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const rawPath = params.path;
    if (typeof rawPath !== "string")
      return { success: false, error: "path must be a string" };

    const storage = getStorage(context);
    if (!storage) return NO_WORKSPACE_ERROR;

    // Normalize "." / "/" / "" to the empty prefix (workspace root).
    const listPrefix =
      rawPath === "." || rawPath === "/" || rawPath === "" ? "" : rawPath;

    // Reject traversal explicitly so we don't quietly return an empty list.
    if (rawPath.includes("..")) {
      return { success: false, error: "Path traversal not allowed" };
    }

    let result;
    try {
      result = await storage.list(listPrefix, { delimiter: "/" });
    } catch {
      return { success: false, error: "Path traversal not allowed" };
    }
    if (
      result.entries.length === 0 &&
      result.commonPrefixes.length === 0 &&
      listPrefix !== ""
    ) {
      let stillExists = false;
      try {
        stillExists = await storage.exists(storage.uriForKey(listPrefix));
      } catch {
        return { success: false, error: "Path traversal not allowed" };
      }
      if (!stillExists) {
        return { success: false, error: `Directory not found: ${rawPath}` };
      }
    }
    const prefixToStrip = rawPath ? `${rawPath.replace(/\/+$/, "")}/` : "";
    const entries: Array<{ name: string; size: number; is_dir: boolean }> = [];
    for (const entry of result.entries) {
      const name = prefixToStrip && entry.key.startsWith(prefixToStrip)
        ? entry.key.slice(prefixToStrip.length)
        : entry.key;
      entries.push({ name, size: entry.size, is_dir: false });
    }
    for (const cp of result.commonPrefixes) {
      const trimmed = cp.replace(/\/+$/, "");
      const name =
        prefixToStrip && trimmed.startsWith(prefixToStrip.replace(/\/+$/, ""))
          ? trimmed.slice(prefixToStrip.length).replace(/^\/+/, "")
          : trimmed;
      entries.push({
        name: name.split("/").pop() ?? name,
        size: 0,
        is_dir: true
      });
    }

    return { success: true, entries };
  }
}
