/**
 * The state of one owner's library index (D22, D29): item counts by state,
 * how much of it has vectors, and the embedding space. `nodetool search
 * status` and the index status display read it. Rebuild requests live here
 * too.
 */

import { and, count, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { getPortableDb, searchChunks, searchItems } from "@nodetool-ai/models";
import { unembeddedChunkCount } from "./embed.js";
import {
  dropLibraryCollections,
  libraryCollections,
  libraryEmbeddingSpace,
  librarySemanticChoice
} from "./semantic.js";
import { reconcileLibraryIndex, wakeLibraryIndexer } from "./sync.js";

export interface LibraryIndexStatus {
  items: { ready: number; pending: number; failed: number; skipped: number; total: number };
  chunks: number;
  semantic: {
    /** `provider:model`, or null when search by meaning is off. */
    space: string | null;
    /** `unset` until someone turns search by meaning on or off. */
    choice: "on" | "off" | "unset";
    /** Chunks with a vector in the configured space. */
    embedded: number;
    /** Chunks still waiting for one, outside excluded projects. */
    remaining: number;
    /** Spaces with a collection; more than one while a rebuild runs. */
    collections: string[];
  };
  /** The most recent failures, newest first. */
  failures: Array<{ itemId: string; title: string; error: string | null }>;
}

export async function libraryIndexStatus(userId: string): Promise<LibraryIndexStatus> {
  const db = getPortableDb();
  const states = await db
    .select({ state: searchItems.state, n: count() })
    .from(searchItems)
    .where(and(eq(searchItems.user_id, userId), ne(searchItems.state, "excluded")))
    .groupBy(searchItems.state);
  const byState = new Map(states.map((row) => [row.state, Number(row.n)]));
  const [chunkRow] = await db
    .select({ n: count() })
    .from(searchChunks)
    .innerJoin(searchItems, eq(searchItems.id, searchChunks.item_id))
    .where(and(eq(searchItems.user_id, userId), ne(searchItems.state, "excluded")));
  const space = await libraryEmbeddingSpace();
  let embedded = 0;
  let remaining = 0;
  let collections: string[] = [];
  if (space) {
    const [embeddedRow] = await db
      .select({ n: count() })
      .from(searchChunks)
      .innerJoin(searchItems, eq(searchItems.id, searchChunks.item_id))
      .where(and(eq(searchItems.user_id, userId), eq(searchChunks.embedding_space, space.id)));
    embedded = Number(embeddedRow?.n ?? 0);
    remaining = await unembeddedChunkCount(userId, space);
    collections = (await libraryCollections(userId)).map((collection) => collection.space.id);
  }
  const failures = await db
    .select({ itemId: searchItems.id, title: searchItems.title, error: searchItems.error })
    .from(searchItems)
    .where(and(eq(searchItems.user_id, userId), eq(searchItems.state, "failed")))
    .orderBy(sql`${searchItems.updated_at} DESC`)
    .limit(10);
  const items = {
    ready: byState.get("ready") ?? 0,
    pending: byState.get("pending") ?? 0,
    failed: byState.get("failed") ?? 0,
    skipped: byState.get("skipped") ?? 0,
    total: 0
  };
  items.total = items.ready + items.pending + items.failed + items.skipped;
  return {
    items,
    chunks: Number(chunkRow?.n ?? 0),
    semantic: { space: space?.id ?? null, choice: await librarySemanticChoice(), embedded, remaining, collections },
    failures
  };
}

/**
 * Rebuild one owner's index. `vectors` embeds every chunk again and drops the
 * collections; `all` also extracts every item again. The indexer does the work.
 */
export async function rebuildLibraryIndex(userId: string, scope: "vectors" | "all" = "all"): Promise<{ items: number }> {
  const db = getPortableDb();
  const owned = await db
    .select({ id: searchItems.id })
    .from(searchItems)
    .where(and(eq(searchItems.user_id, userId), ne(searchItems.state, "excluded")));
  const ids = owned.map((row) => row.id);
  for (let start = 0; start < ids.length; start += 500) {
    const batch = ids.slice(start, start + 500);
    await db
      .update(searchChunks)
      .set({ embedding_space: null })
      .where(and(inArray(searchChunks.item_id, batch), isNotNull(searchChunks.embedding_space)));
    if (scope === "all") {
      // The next reconcile sees an old extractor version and queues every
      // item that has content, as after an extractor upgrade.
      await db.update(searchItems).set({ extractor_version: 0 }).where(inArray(searchItems.id, batch));
    }
  }
  if (await libraryEmbeddingSpace()) await dropLibraryCollections(userId);
  if (scope === "all") await reconcileLibraryIndex({ userId });
  wakeLibraryIndexer();
  return { items: ids.length };
}
