/**
 * The `memory` capability module — durable memory an agent manages explicitly.
 *
 * Scope is the **user**, not the conversation. A memory saved in one thread is
 * readable from every other one; `thread_id` records where it was written and
 * is a filter callers may apply, never a boundary the store enforces. Saving
 * still needs no thread — a memory written outside a chat carries an empty
 * `thread_id`.
 *
 * Five capabilities, built by name from `memory.specs.ts`. The run-scoped half
 * of memory — `list_shared` / `read_shared` / `share_result` over
 * `context.memory` — is the `shared` module, kept apart because its lifetime is
 * the run, not the user.
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
  Memory as MemoryRow,
  MemoryKind,
  MemoryResource
} from "@nodetool-ai/models";
import type { CapabilityExport, CapabilityModule } from "./types.js";
import {
  memorySaveSpec,
  memoryListSpec,
  memorySearchSpec,
  memoryUpdateSpec,
  memoryDeleteSpec
} from "./memory.specs.js";
import { isObjectLike, isString } from "../utils/type-guards.js";

const VALID_KINDS: ReadonlySet<string> = new Set([
  "note",
  "fact",
  "preference",
  "decision",
  "resource"
]);

function coerceKind(value: unknown): MemoryKind {
  if (!isString(value)) return "note";
  const lower = value.toLowerCase().trim();
  return (VALID_KINDS.has(lower) ? lower : "note") as MemoryKind;
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
  resources: MemoryResource[];
  dropped: MemoryResource[];
}> {
  if (!Array.isArray(raw)) return { resources: [], dropped: [] };
  const { Asset } = await import("@nodetool-ai/models");
  const resources: MemoryResource[] = [];
  const dropped: MemoryResource[] = [];

  // Pre-fetch all assets to avoid N+1 queries
  const assetIds = new Set<string>();
  const rawObjects: Array<{
    obj: Record<string, unknown>;
    ref: MemoryResource;
  }> = [];

  for (const value of raw) {
    if (!isObjectLike(value)) continue;
    const obj = value as Record<string, unknown>;
    const type = isString(obj.type) ? obj.type.trim() : "";
    const id = isString(obj.id) ? obj.id.trim() : "";
    if (!type || !id) continue;
    const ref: MemoryResource = { type, id };
    if (isString(obj.uri) && obj.uri) ref.uri = obj.uri;
    if (isString(obj.label) && obj.label) ref.label = obj.label;

    rawObjects.push({ obj, ref });
    if (type === "asset") {
      assetIds.add(id);
    }
  }

  const assetMap = new Map();
  if (assetIds.size > 0) {
    const assets = await Asset.findMany(userId, Array.from(assetIds));
    for (const asset of assets) {
      assetMap.set(asset.id, asset);
    }
  }

  for (const { obj, ref } of rawObjects) {
    if (ref.type === "asset") {
      const asset = assetMap.get(ref.id);
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
  resources: MemoryResource[] | null | undefined
): Promise<MemoryResource[]> {
  if (!Array.isArray(resources) || resources.length === 0) return [];
  const { Asset } = await import("@nodetool-ai/models");

  const assetIds = new Set<string>();
  for (const ref of resources) {
    if (isObjectLike(ref) && ref.type === "asset") {
      assetIds.add(ref.id);
    }
  }

  const assetMap = new Map();
  if (assetIds.size > 0) {
    const assets = await Asset.findMany(userId, Array.from(assetIds));
    for (const asset of assets) {
      assetMap.set(asset.id, asset);
    }
  }

  const out: MemoryResource[] = [];
  for (const ref of resources) {
    if (!isObjectLike(ref)) continue;
    if (ref.type === "asset") {
      const asset = assetMap.get(ref.id);
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

function requireUser(
  context: ProcessingContext
): { userId: string; threadId: string } | { error: string } {
  const userId = context.userId;
  if (!userId) return { error: "No user context; cannot access memory." };
  // Empty outside a chat thread. Saving stamps it as provenance; reading uses
  // it only when the caller asks for `thread: "current"`.
  return { userId, threadId: context.threadId ?? "" };
}

/**
 * Turn the `thread` parameter into a listing filter. `"current"` narrows to
 * the thread the turn is running in; anything else — including the default —
 * reads every thread.
 */
function threadFilter(value: unknown, threadId: string): { threadId?: string } {
  return isString(value) && value.trim().toLowerCase() === "current"
    ? { threadId }
    : {};
}

/** The `kinds` parameter, keeping only recognized kinds. */
function kindsFilter(value: unknown): { kinds?: string[] } {
  if (!Array.isArray(value)) return {};
  const kinds = value.filter(
    (kind): kind is string => isString(kind) && VALID_KINDS.has(kind)
  );
  return kinds.length > 0 ? { kinds } : {};
}

/** Clamp a caller-supplied count into [1, max], falling back to `fallback`. */
function boundedLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.floor(parsed), max)
    : fallback;
}

function droppedNote(dropped: MemoryResource[]): Record<string, unknown> {
  return dropped.length > 0
    ? {
        dropped_resources: dropped,
        note: "Some asset references were not found and were dropped."
      }
    : {};
}

// ---------------------------------------------------------------------------
// memory_save
// ---------------------------------------------------------------------------

const memorySave: CapabilityExport = {
  spec: memorySaveSpec,
  impl: async (run, params) => {
    const scope = requireUser(run.context);
    if ("error" in scope) return { success: false, error: scope.error };

    const content = isString(params.content) ? params.content.trim() : "";
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
      const { Memory } = await import("@nodetool-ai/models");
      const memory = await Memory.create<MemoryRow>({
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
// memory_list
// ---------------------------------------------------------------------------

/** Shape one row for a tool result, resolving its resource refs. */
async function toItem(
  userId: string,
  currentThreadId: string,
  memory: MemoryRow
): Promise<Record<string, unknown>> {
  return {
    memory_id: memory.id,
    kind: memory.kind,
    title: memory.title,
    content: memory.content,
    // Says which conversation the memory came from, so an agent reading a
    // cross-thread result knows what is from here and what is not.
    from_current_thread: Boolean(
      currentThreadId && memory.thread_id === currentThreadId
    ),
    created_at: memory.created_at,
    updated_at: memory.updated_at,
    resources: await resolveResources(userId, memory.resources)
  };
}

const memoryList: CapabilityExport = {
  spec: memoryListSpec,
  impl: async (run, params) => {
    const scope = requireUser(run.context);
    if ("error" in scope) return { success: false, error: scope.error };

    try {
      const { Memory } = await import("@nodetool-ai/models");
      const rows = await Memory.list(scope.userId, {
        limit: boundedLimit(params.limit, 100, 200),
        ...threadFilter(params.thread, scope.threadId),
        ...kindsFilter(params.kinds)
      });
      const items = [];
      for (const memory of rows) {
        items.push(await toItem(scope.userId, scope.threadId, memory));
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
// memory_search
// ---------------------------------------------------------------------------

const memorySearch: CapabilityExport = {
  spec: memorySearchSpec,
  impl: async (run, params) => {
    const scope = requireUser(run.context);
    if ("error" in scope) return { success: false, error: scope.error };

    const query = isString(params.query) ? params.query.trim() : "";
    if (!query) {
      return { success: false, error: "query is required" };
    }

    try {
      const { Memory } = await import("@nodetool-ai/models");
      const rows = await Memory.search(scope.userId, query, {
        limit: boundedLimit(params.limit, 25, 200),
        ...threadFilter(params.thread, scope.threadId),
        ...kindsFilter(params.kinds)
      });
      const items = [];
      for (const memory of rows) {
        items.push(await toItem(scope.userId, scope.threadId, memory));
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
// memory_update
// ---------------------------------------------------------------------------

const memoryUpdate: CapabilityExport = {
  spec: memoryUpdateSpec,
  impl: async (run, params) => {
    const scope = requireUser(run.context);
    if ("error" in scope) return { success: false, error: scope.error };

    const memoryId = isString(params.memory_id) ? params.memory_id : "";
    if (!memoryId) {
      return { success: false, error: "memory_id is required" };
    }

    try {
      const { Memory } = await import("@nodetool-ai/models");
      const memory = await Memory.find(scope.userId, memoryId);
      if (!memory) {
        return { success: false, error: `Memory not found: ${memoryId}` };
      }

      let dropped: MemoryResource[] = [];
      if (isString(params.content)) memory.content = params.content.trim();
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
// memory_delete
// ---------------------------------------------------------------------------

const memoryDelete: CapabilityExport = {
  spec: memoryDeleteSpec,
  impl: async (run, params) => {
    const scope = requireUser(run.context);
    if ("error" in scope) return { success: false, error: scope.error };

    const memoryId = isString(params.memory_id) ? params.memory_id : "";
    if (!memoryId) {
      return { success: false, error: "memory_id is required" };
    }

    try {
      const { Memory } = await import("@nodetool-ai/models");
      const memory = await Memory.find(scope.userId, memoryId);
      if (!memory) {
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

/** Every memory capability, in the order memory-tools.ts declared them. */
export const MEMORY_CAPABILITIES: readonly CapabilityExport[] = [
  memorySave,
  memoryList,
  memorySearch,
  memoryUpdate,
  memoryDelete
];

export const module: CapabilityModule = {
  module: "memory",
  exports: MEMORY_CAPABILITIES
};

export { memorySave, memoryList, memorySearch, memoryUpdate, memoryDelete };
