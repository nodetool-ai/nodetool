/**
 * Keeping the library index in step with its source rows: the reconcile sweep
 * (D14 step 1) and the inline writes on create, save and delete (D4).
 *
 * The reconcile is the correctness mechanism. Change signals only shorten the
 * delay, because a raw Drizzle update produces none (R6).
 */

import { and, eq } from "drizzle-orm";
import { createLogger } from "@nodetool-ai/config";
import {
  Asset,
  getDatabase,
  getPortableDb,
  ModelChangeEvent,
  ModelObserver,
  searchItems,
  type DatabaseConnection,
  type DBModel
} from "@nodetool-ai/models";
import { SEARCH_RESOURCE_TYPES, type SearchResourceType } from "@nodetool-ai/protocol";
import { EXTRACTOR_VERSION } from "./extract.js";
import {
  deleteIndexedItem,
  deleteItemsById,
  writeIndexedItem,
  writeExcludedItem
} from "./index-writer.js";
import { extractSources, listSourceVersions, RESOURCE_TYPE_BY_MODEL } from "./sources.js";

const log = createLogger("nodetool.search.sync");

/** What one reconcile did. */
export interface ReconcileResult {
  indexed: number;
  excluded: number;
  removed: number;
  /** Items left for the indexer to extract. */
  pending: number;
}

function emptyResult(): ReconcileResult {
  return { indexed: 0, excluded: 0, removed: 0, pending: 0 };
}

let wakeIndexer: (() => void) | null = null;

/**
 * Called whenever a write leaves work for the indexer. The server points it
 * at the indexer child's IPC channel; the indexer itself points it at its own
 * wait.
 */
export function setLibraryIndexerWake(handler: (() => void) | null): void {
  wakeIndexer = handler;
}

/** Tell the indexer there is work, through whatever handler is set. */
export function wakeLibraryIndexer(): void {
  wakeIndexer?.();
}

/** Bring the items of some source rows up to date. Rows that are gone lose their items. */
async function syncRows(
  resourceType: SearchResourceType,
  userId: string,
  rows: ReadonlyArray<{ id: string }>,
  result: ReconcileResult,
  priority = 0
): Promise<void> {
  const extracted = await extractSources(
    resourceType,
    userId,
    rows.map((row) => row.id)
  );
  for (const row of rows) {
    const item = extracted.get(row.id);
    if (item === undefined) {
      await deleteIndexedItem(userId, resourceType, row.id);
      result.removed += 1;
    } else if ("excluded" in item) {
      await writeExcludedItem(userId, resourceType, row.id, item.sourceVersion);
      result.excluded += 1;
    } else {
      const written = await writeIndexedItem(item, { priority });
      result.indexed += 1;
      if (written.pending) result.pending += 1;
    }
  }
}

/**
 * Compare every source row with its item, optionally for one owner. Rows with
 * no item, or whose item was built from another version or by another
 * extractor, are indexed again. Items whose source row is gone are removed.
 */
export async function reconcileLibraryIndex(
  options: { userId?: string } = {}
): Promise<ReconcileResult> {
  const result = emptyResult();
  const db = getPortableDb();
  for (const resourceType of SEARCH_RESOURCE_TYPES) {
    const sources = await listSourceVersions(resourceType, options.userId);
    const items = await db
      .select({
        id: searchItems.id,
        user_id: searchItems.user_id,
        resource_id: searchItems.resource_id,
        source_version: searchItems.source_version,
        extractor_version: searchItems.extractor_version
      })
      .from(searchItems)
      .where(
        and(
          eq(searchItems.resource_type, resourceType),
          options.userId ? eq(searchItems.user_id, options.userId) : undefined
        )
      );
    const itemByKey = new Map(items.map((item) => [`${item.user_id}\u0000${item.resource_id}`, item]));

    const staleByUser = new Map<string, Array<{ id: string; version: string }>>();
    for (const source of sources) {
      const key = `${source.userId}\u0000${source.id}`;
      const item = itemByKey.get(key);
      itemByKey.delete(key);
      if (
        item &&
        item.source_version === source.version &&
        item.extractor_version === EXTRACTOR_VERSION
      ) {
        continue;
      }
      const list = staleByUser.get(source.userId) ?? [];
      list.push({ id: source.id, version: source.version });
      staleByUser.set(source.userId, list);
    }

    // What is left in the map has no source row.
    const orphans = [...itemByKey.values()].map((item) => item.id);
    await deleteItemsById(orphans);
    result.removed += orphans.length;

    for (const [userId, rows] of staleByUser) {
      for (let start = 0; start < rows.length; start += 200) {
        await syncRows(resourceType, userId, rows.slice(start, start + 200), result);
      }
    }
  }
  if (result.pending > 0) wakeIndexer?.();
  return result;
}

// ── Inline writes ────────────────────────────────────────────────────

interface PendingWrite {
  resourceType: SearchResourceType;
  userId: string;
  id: string;
  deleted: boolean;
  /** An asset folder: its descendants show its name in their folder path. */
  folder: boolean;
}

const pending = new Map<string, PendingWrite>();
let flushing: Promise<void> | null = null;

function fieldOf(instance: DBModel, key: string): unknown {
  return (instance as unknown as Record<string, unknown>)[key];
}

const onModelChange = (instance: DBModel, event: ModelChangeEvent): void => {
  const resourceType = RESOURCE_TYPE_BY_MODEL[instance.constructor.name];
  if (!resourceType) return;
  const id = fieldOf(instance, "id");
  const userId = fieldOf(instance, "user_id");
  if (typeof id !== "string" || typeof userId !== "string") return;
  pending.set(`${resourceType}\u0000${id}`, {
    resourceType,
    userId,
    id,
    deleted: event === ModelChangeEvent.DELETED,
    folder: resourceType === "asset" && fieldOf(instance, "content_type") === "folder"
  });
  scheduleFlush();
};

function scheduleFlush(): void {
  if (flushing) return;
  flushing = new Promise<void>((resolve) => setImmediate(resolve))
    .then(drainPending)
    .finally(() => {
      flushing = null;
      if (pending.size > 0) scheduleFlush();
    });
}

/**
 * Write the queued changes one at a time. A failed write is logged and left
 * for the reconcile, which finds the item out of date.
 */
async function drainPending(): Promise<void> {
  const writes = [...pending.values()];
  pending.clear();
  for (const write of writes) {
    try {
      if (write.deleted) {
        await deleteIndexedItem(write.userId, write.resourceType, write.id);
      } else if (write.folder) {
        await resyncFolderDescendants(write.userId, write.id);
      } else {
        // A person's own change goes ahead of backfill (D14).
        const result = emptyResult();
        await syncRows(write.resourceType, write.userId, [{ id: write.id }], result, 2);
        if (result.pending > 0) wakeIndexer?.();
      }
    } catch (error) {
      log.warn("Library index write failed; the reconcile will retry it", {
        resource_type: write.resourceType,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

/**
 * Re-extract every asset under a folder. A rename or move of the folder
 * changes the folder path of each of them without touching their own rows.
 */
async function resyncFolderDescendants(userId: string, folderId: string): Promise<void> {
  const { assets } = await Asset.getAssetsRecursive(userId, folderId);
  const ids: string[] = [];
  const walk = (rows: ReadonlyArray<Record<string, unknown>>): void => {
    for (const row of rows) {
      if (typeof row.id === "string" && row.content_type !== "folder") ids.push(row.id);
      if (Array.isArray(row.children)) walk(row.children as Array<Record<string, unknown>>);
    }
  };
  walk(assets);
  const counts = { indexed: 0, skipped: 0, removed: 0 };
  for (let start = 0; start < ids.length; start += 200) {
    await syncRows(
      "asset",
      userId,
      ids.slice(start, start + 200).map((id) => ({ id, version: "" })),
      counts
    );
  }
}

/** Wait until the inline writes queued so far are in the index. */
export async function flushLibraryIndexWrites(): Promise<void> {
  while (flushing) await flushing;
}

/**
 * Index assets and documents as they are created, saved and deleted.
 * Idempotent: a test database setup that clears `ModelObserver` can call it
 * again.
 */
export function startLibraryIndexWrites(): void {
  ModelObserver.unsubscribe(onModelChange);
  ModelObserver.subscribe(onModelChange);
}

export function stopLibraryIndexWrites(): void {
  ModelObserver.unsubscribe(onModelChange);
}

// ── Reconcile before a query ─────────────────────────────────────────

/** How long a per-owner reconcile stays fresh for queries. */
const OWNER_RECONCILE_TTL_MS = 60_000;

const reconciledAt = new WeakMap<DatabaseConnection, Map<string, number>>();
const inFlight = new Map<string, Promise<void>>();

/**
 * Make sure one owner's items are current before a query. A host that runs no
 * sweep, such as the CLI, still gets a complete index. The result is cached
 * per connection and owner for a minute, and the inline writes cover changes
 * made in this process meanwhile.
 */
export async function ensureLibraryIndexed(userId: string): Promise<void> {
  startLibraryIndexWrites();
  await flushLibraryIndexWrites();
  const connection = getDatabase();
  const owners = reconciledAt.get(connection) ?? new Map<string, number>();
  reconciledAt.set(connection, owners);
  const last = owners.get(userId);
  if (last !== undefined && Date.now() - last < OWNER_RECONCILE_TTL_MS) return;
  // Concurrent queries for one owner share one reconcile.
  let running = inFlight.get(userId);
  if (!running) {
    running = reconcileLibraryIndex({ userId })
      .then(() => {
        owners.set(userId, Date.now());
      })
      .finally(() => inFlight.delete(userId));
    inFlight.set(userId, running);
  }
  await running;
}
