/**
 * The `memory` capability module — durable, per-conversation memory an agent
 * manages explicitly.
 *
 * Four capabilities that used to be four `Tool` subclasses in
 * `../tools/thread-memory-tools.ts`, which now keeps only their names. Wire
 * names, descriptions and schemas are unchanged; a belt builds all four from
 * `memory.specs.ts` by name.
 *
 * Scope is the AgentMemory-free half of memory. The run-scoped half —
 * `list_shared` / `read_shared` / `share_result` over `context.memory` — is the
 * `shared` module, kept apart because its lifetime is the run, not the thread.
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
import {
  threadMemorySaveSpec,
  threadMemoryListSpec,
  threadMemoryUpdateSpec,
  threadMemoryDeleteSpec,
  KNOWN_RESOURCE_TYPES,
  KIND_SCHEMA,
  RESOURCES_SCHEMA
} from "./memory.specs.js";
import { isObjectLike, isString } from "../utils/type-guards.js";

export {
  KNOWN_RESOURCE_TYPES,
  KIND_SCHEMA,
  RESOURCES_SCHEMA
} from "./memory.specs.js";

const VALID_KINDS: ReadonlySet<string> = new Set([
  "note",
  "fact",
  "preference",
  "decision",
  "resource"
]);

function coerceKind(value: unknown): ThreadMemoryKind {
  if (!isString(value)) return "note";
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
    if (!isObjectLike(value)) continue;
    const obj = value as Record<string, unknown>;
    const type = isString(obj.type) ? obj.type.trim() : "";
    const id = isString(obj.id) ? obj.id.trim() : "";
    if (!type || !id) continue;
    const ref: ThreadMemoryResource = { type, id };
    if (isString(obj.uri) && obj.uri) ref.uri = obj.uri;
    if (isString(obj.label) && obj.label) ref.label = obj.label;
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
    if (!isObjectLike(ref)) continue;
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
  spec: threadMemorySaveSpec,
  impl: async (run, params) => {
    const scope = requireThread(run.context);
    if ("error" in scope) return { success: false, error: scope.error };

    const content =
      isString(params.content) ? params.content.trim() : "";
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
        title: isString(params.title) ? params.title.trim() : "",
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
  spec: threadMemoryListSpec,
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
  spec: threadMemoryUpdateSpec,
  impl: async (run, params) => {
    const scope = requireThread(run.context);
    if ("error" in scope) return { success: false, error: scope.error };

    const memoryId =
      isString(params.memory_id) ? params.memory_id : "";
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
      if (isString(params.content))
        memory.content = params.content.trim();
      if (isString(params.title)) memory.title = params.title.trim();
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
  spec: threadMemoryDeleteSpec,
  impl: async (run, params) => {
    const scope = requireThread(run.context);
    if ("error" in scope) return { success: false, error: scope.error };

    const memoryId =
      isString(params.memory_id) ? params.memory_id : "";
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
