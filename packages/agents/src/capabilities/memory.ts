/**
 * The `memory` capability module — durable, per-conversation memory an agent
 * manages explicitly.
 *
 * Four capabilities that used to be four `Tool` subclasses in
 * `../tools/thread-memory-tools.ts`. Wire names, descriptions and schemas are
 * unchanged; the classes survive as thin subclasses over these
 * implementations.
 *
 * Scope is the AgentMemory-free half of memory: `memory_list` / `memory_read`
 * / `memory_write` stay executor-internal and are not capabilities.
 *
 * `@nodetool-ai/models` is imported inside each implementation, so loading
 * this module never opens a database.
 *
 * Design: docs/tool-class-retirement-design.md § "PRs 4–9 — remaining
 * namespaces".
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type {
  Asset,
  ThreadMemory as ThreadMemoryRow,
  ThreadMemoryKind,
  ThreadMemoryResource
} from "@nodetool-ai/models";
import type { CapabilityExport, CapabilityModule } from "./types.js";

const VALID_KINDS: ReadonlySet<string> = new Set([
  "note",
  "fact",
  "preference",
  "decision",
  "resource"
]);

/** Known resource kinds — advisory; any string is accepted. */
const KNOWN_RESOURCE_TYPES = [
  "asset",
  "workflow",
  "collection",
  "node",
  "job",
  "timeline",
  "script",
  "storyboard",
  "image_document",
  "thread",
  "url",
  "other"
];

const KIND_SCHEMA = {
  type: "string" as const,
  enum: ["note", "fact", "preference", "decision", "resource"],
  description:
    "Category of the memory. Use 'resource' when the point is the referenced " +
    "resource(s), 'preference'/'decision'/'fact' for durable project context, " +
    "else 'note'. Defaults to 'note'."
};

const RESOURCES_SCHEMA = {
  type: "array" as const,
  items: {
    type: "object" as const,
    properties: {
      type: {
        type: "string" as const,
        description:
          "Resource kind — one of: " +
          KNOWN_RESOURCE_TYPES.join(", ") +
          ". Any other value is allowed too."
      },
      id: {
        type: "string" as const,
        description:
          "Identifier: asset id, workflow id, collection name, node type, a URL, etc."
      },
      uri: {
        type: "string" as const,
        description: "Optional canonical uri (asset://…, https://…)."
      },
      label: { type: "string" as const, description: "Optional human label." }
    },
    required: ["type", "id"]
  },
  description:
    "Typed references to resources this memory is about — the assets you " +
    "generated (type 'asset'), a workflow you built ('workflow'), a collection, " +
    "a URL, etc. — so you can find and reuse them later. Asset references are " +
    "validated and resolved to their asset:// uri; other kinds are stored as-is."
};

function coerceKind(value: unknown): ThreadMemoryKind {
  if (typeof value !== "string") return "note";
  const lower = value.toLowerCase().trim();
  return (VALID_KINDS.has(lower) ? lower : "note") as ThreadMemoryKind;
}

/** Build the canonical `asset://<id>.<ext>` uri for an asset. */
function assetUri(asset: Asset): string {
  const ext = asset.fileExtension;
  return ext ? `asset://${asset.id}.${ext}` : `asset://${asset.id}`;
}

/**
 * Normalize incoming resource refs from tool params. Asset refs are validated
 * against the user's library — unknown/foreign asset ids are dropped and
 * reported; every other kind is kept as-is (external URLs, resources the model
 * layer can't cheaply verify). `uri`/`label` for assets are backfilled.
 */
async function normalizeResources(
  userId: string,
  raw: unknown
): Promise<{
  resources: ThreadMemoryResource[];
  dropped: ThreadMemoryResource[];
}> {
  if (!Array.isArray(raw)) return { resources: [], dropped: [] };
  const { Asset } = await import("@nodetool-ai/models");
  const resources: ThreadMemoryResource[] = [];
  const dropped: ThreadMemoryResource[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") continue;
    const obj = value as Record<string, unknown>;
    const type = typeof obj.type === "string" ? obj.type.trim() : "";
    const id = typeof obj.id === "string" ? obj.id.trim() : "";
    if (!type || !id) continue;
    const ref: ThreadMemoryResource = {
      type,
      id,
      ...(typeof obj.uri === "string" && obj.uri ? { uri: obj.uri } : {}),
      ...(typeof obj.label === "string" && obj.label
        ? { label: obj.label }
        : {})
    };
    if (type === "asset") {
      const asset = await Asset.find(userId, id);
      if (!asset) {
        dropped.push(ref);
        continue;
      }
      ref.uri = assetUri(asset);
      if (!ref.label) ref.label = asset.name;
      ref.metadata = { content_type: asset.content_type };
    }
    resources.push(ref);
  }
  return { resources, dropped };
}

/**
 * Resolve stored resource refs for display: re-check asset existence (dropping
 * assets the user no longer owns) and refresh their uri/label; pass every other
 * kind through unchanged.
 */
async function resolveResources(
  userId: string,
  resources: ThreadMemoryResource[] | null | undefined
): Promise<ThreadMemoryResource[]> {
  if (!Array.isArray(resources) || resources.length === 0) return [];
  const { Asset } = await import("@nodetool-ai/models");
  const out: ThreadMemoryResource[] = [];
  for (const ref of resources) {
    if (!ref || typeof ref !== "object") continue;
    if (ref.type === "asset") {
      const asset = await Asset.find(userId, ref.id);
      if (!asset) continue;
      out.push({
        type: "asset",
        id: asset.id,
        uri: assetUri(asset),
        label: ref.label || asset.name,
        metadata: { content_type: asset.content_type }
      });
    } else {
      out.push(ref);
    }
  }
  return out;
}

function requireThread(
  context: ProcessingContext
): { userId: string; threadId: string } | { error: string } {
  const userId = context.userId;
  if (!userId)
    return { error: "No user context; cannot access thread memory." };
  const threadId = context.threadId;
  if (!threadId) {
    return {
      error:
        "No active thread; thread memory is only available inside a chat thread."
    };
  }
  return { userId, threadId };
}

function droppedNote(dropped: ThreadMemoryResource[]): Record<string, unknown> {
  return dropped.length > 0
    ? {
        dropped_resources: dropped,
        note: "Some asset references were not found and were dropped."
      }
    : {};
}

// ---------------------------------------------------------------------------
// thread_memory_save
// ---------------------------------------------------------------------------

const threadMemorySave: CapabilityExport = {
  spec: {
    name: "thread_memory_save",
    description:
      "Save a durable memory to the current conversation. Use it to remember " +
      "project facts, user preferences, decisions, and — crucially — the " +
      "resources you produce or rely on (pass them in `resources`: the assets " +
      "you generate, a workflow you built, a collection, a URL) so you can reuse " +
      "them later. Memories persist across turns and are shown back to you at " +
      "the start of each turn.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description:
            "The memory itself — a self-contained note (e.g. 'The hero image " +
            "uses a teal/orange palette the user approved')."
        },
        title: {
          type: "string",
          description: "Optional short label shown when memories are listed."
        },
        kind: KIND_SCHEMA,
        resources: RESOURCES_SCHEMA
      },
      required: ["content"] as string[]
    },
    category: "write",
    userMessage: (params) => {
      const title = typeof params.title === "string" ? params.title : "";
      return title ? `Remembering: ${title.slice(0, 60)}` : "Saving to memory";
    }
  },
  impl: async (run, params) => {
    const scope = requireThread(run.context);
    if ("error" in scope) return { success: false, error: scope.error };

    const content =
      typeof params.content === "string" ? params.content.trim() : "";
    if (!content) {
      return {
        success: false,
        error: "content is required and must be a non-empty string"
      };
    }
    const { resources, dropped } = await normalizeResources(
      scope.userId,
      params.resources
    );

    try {
      const { ThreadMemory } = await import("@nodetool-ai/models");
      const memory = await ThreadMemory.create<ThreadMemoryRow>({
        user_id: scope.userId,
        thread_id: scope.threadId,
        kind: coerceKind(params.kind),
        title: typeof params.title === "string" ? params.title.trim() : "",
        content,
        resources: resources.length > 0 ? resources : null
      });
      return {
        success: true,
        memory_id: memory.id,
        kind: memory.kind,
        resources,
        ...droppedNote(dropped)
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }
};

// ---------------------------------------------------------------------------
// thread_memory_list
// ---------------------------------------------------------------------------

const threadMemoryList: CapabilityExport = {
  spec: {
    name: "thread_memory_list",
    description:
      "List the durable memories saved for the current conversation, newest " +
      "first, each with its referenced resources resolved (asset references " +
      "carry a live asset:// uri you can pass to view_image or reuse in " +
      "generation tools).",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum memories to return (default 100, max 200)."
        }
      },
      required: [] as string[]
    },
    category: "read",
    userMessage: () => "Recalling conversation memory"
  },
  impl: async (run, params) => {
    const scope = requireThread(run.context);
    if ("error" in scope) return { success: false, error: scope.error };

    const limitParam = Number(params.limit);
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(Math.floor(limitParam), 200)
        : 100;

    try {
      const { ThreadMemory } = await import("@nodetool-ai/models");
      const memories = await ThreadMemory.listByThread(
        scope.userId,
        scope.threadId,
        limit
      );
      const items = [];
      for (const memory of memories) {
        items.push({
          memory_id: memory.id,
          kind: memory.kind,
          title: memory.title,
          content: memory.content,
          created_at: memory.created_at,
          updated_at: memory.updated_at,
          resources: await resolveResources(scope.userId, memory.resources)
        });
      }
      return { success: true, count: items.length, memories: items };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }
};

// ---------------------------------------------------------------------------
// thread_memory_update
// ---------------------------------------------------------------------------

const threadMemoryUpdate: CapabilityExport = {
  spec: {
    name: "thread_memory_update",
    description:
      "Update a memory in the current conversation by id. Only the fields you " +
      "pass are changed; pass `resources` to replace the referenced resources.",
    inputSchema: {
      type: "object",
      properties: {
        memory_id: {
          type: "string",
          description: "Id of the memory to update (from thread_memory_list)."
        },
        content: { type: "string", description: "New content text." },
        title: { type: "string", description: "New title." },
        kind: KIND_SCHEMA,
        resources: RESOURCES_SCHEMA
      },
      required: ["memory_id"] as string[]
    },
    category: "write",
    userMessage: () => "Updating conversation memory"
  },
  impl: async (run, params) => {
    const scope = requireThread(run.context);
    if ("error" in scope) return { success: false, error: scope.error };

    const memoryId =
      typeof params.memory_id === "string" ? params.memory_id : "";
    if (!memoryId) {
      return { success: false, error: "memory_id is required" };
    }

    try {
      const { ThreadMemory } = await import("@nodetool-ai/models");
      const memory = await ThreadMemory.find(scope.userId, memoryId);
      if (!memory || memory.thread_id !== scope.threadId) {
        return { success: false, error: `Memory not found: ${memoryId}` };
      }

      let dropped: ThreadMemoryResource[] = [];
      if (typeof params.content === "string")
        memory.content = params.content.trim();
      if (typeof params.title === "string") memory.title = params.title.trim();
      if (params.kind !== undefined) memory.kind = coerceKind(params.kind);
      if (params.resources !== undefined) {
        const normalized = await normalizeResources(
          scope.userId,
          params.resources
        );
        memory.resources =
          normalized.resources.length > 0 ? normalized.resources : null;
        dropped = normalized.dropped;
      }
      await memory.save();

      return {
        success: true,
        memory_id: memory.id,
        resources: await resolveResources(scope.userId, memory.resources),
        ...droppedNote(dropped)
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }
};

// ---------------------------------------------------------------------------
// thread_memory_delete
// ---------------------------------------------------------------------------

const threadMemoryDelete: CapabilityExport = {
  spec: {
    name: "thread_memory_delete",
    description:
      "Delete a memory from the current conversation by id when it's no longer " +
      "relevant or was superseded.",
    inputSchema: {
      type: "object",
      properties: {
        memory_id: {
          type: "string",
          description: "Id of the memory to delete (from thread_memory_list)."
        }
      },
      required: ["memory_id"] as string[]
    },
    category: "write",
    userMessage: () => "Forgetting a memory"
  },
  impl: async (run, params) => {
    const scope = requireThread(run.context);
    if ("error" in scope) return { success: false, error: scope.error };

    const memoryId =
      typeof params.memory_id === "string" ? params.memory_id : "";
    if (!memoryId) {
      return { success: false, error: "memory_id is required" };
    }

    try {
      const { ThreadMemory } = await import("@nodetool-ai/models");
      const memory = await ThreadMemory.find(scope.userId, memoryId);
      if (!memory || memory.thread_id !== scope.threadId) {
        return { success: false, error: `Memory not found: ${memoryId}` };
      }
      await memory.delete();
      return { success: true, memory_id: memoryId };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }
};

/** Every memory capability, in the order thread-memory-tools.ts declared them. */
export const MEMORY_CAPABILITIES: readonly CapabilityExport[] = [
  threadMemorySave,
  threadMemoryList,
  threadMemoryUpdate,
  threadMemoryDelete
];

export const module: CapabilityModule = {
  module: "memory",
  exports: MEMORY_CAPABILITIES
};

export {
  threadMemorySave,
  threadMemoryList,
  threadMemoryUpdate,
  threadMemoryDelete
};
