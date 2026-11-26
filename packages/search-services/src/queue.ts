/**
 * The item table is the indexing queue (D3, D13). The indexer claims pending
 * rows with a conditional update on `lease_version`, as `claimGenerationLease`
 * does, so two indexers never work on the same item. A lease that expires is
 * claimable again, so a crashed indexer loses nothing.
 */

import { and, asc, desc, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";
import {
  getPortableDb,
  searchChunks,
  searchItems,
  withTransaction
} from "@nodetool-ai/models";
import type { SearchResourceType } from "@nodetool-ai/protocol";
import type { ExtractedChunk } from "./extract.js";
import { METADATA_FIELDS } from "./index-writer.js";
import { removeChunkVectors } from "./semantic.js";
import { existingSourceIds } from "./sources.js";

/** Chunks extraction leaves alone: the inline write's and enrichment's. */
const KEPT_FIELDS = [...METADATA_FIELDS, "caption", "transcript"] as const;

/** How long one claim holds an item. */
export const LEASE_MS = 10 * 60 * 1000;
/** Attempts before an item stays `failed`. */
export const MAX_ATTEMPTS = 5;
/** First retry delay; each further attempt doubles it. */
export const RETRY_BASE_MS = 30_000;

/** One claimed item. */
export interface ClaimedItem {
  id: string;
  userId: string;
  resourceType: SearchResourceType;
  resourceId: string;
  sourceVersion: string;
  attempts: number;
  leaseVersion: number;
}

/**
 * Claim up to `limit` pending items for `owner`: a person's own changes
 * first, then the most recently updated, then backfill (D14).
 */
export async function claimPendingItems(
  owner: string,
  limit: number,
  now = new Date()
): Promise<ClaimedItem[]> {
  const db = getPortableDb();
  const at = now.toISOString();
  const candidates = await db
    .select({
      id: searchItems.id,
      user_id: searchItems.user_id,
      resource_type: searchItems.resource_type,
      resource_id: searchItems.resource_id,
      source_version: searchItems.source_version,
      attempts: searchItems.attempts,
      lease_version: searchItems.lease_version
    })
    .from(searchItems)
    .where(
      and(
        eq(searchItems.state, "pending"),
        or(isNull(searchItems.next_attempt_at), lte(searchItems.next_attempt_at, at)),
        or(isNull(searchItems.lease_expires_at), lt(searchItems.lease_expires_at, at))
      )
    )
    .orderBy(desc(searchItems.priority), desc(searchItems.updated_at), asc(searchItems.id))
    .limit(limit * 2);

  const claimed: ClaimedItem[] = [];
  const expires = new Date(now.getTime() + LEASE_MS).toISOString();
  for (const candidate of candidates) {
    if (claimed.length >= limit) break;
    const won = await db
      .update(searchItems)
      .set({
        lease_owner: owner,
        lease_expires_at: expires,
        lease_version: candidate.lease_version + 1
      })
      .where(
        and(
          eq(searchItems.id, candidate.id),
          eq(searchItems.lease_version, candidate.lease_version),
          eq(searchItems.state, "pending")
        )
      )
      .returning({ id: searchItems.id });
    if (won.length === 0) continue;
    claimed.push({
      id: candidate.id,
      userId: candidate.user_id,
      resourceType: candidate.resource_type as SearchResourceType,
      resourceId: candidate.resource_id,
      sourceVersion: candidate.source_version,
      attempts: candidate.attempts,
      leaseVersion: candidate.lease_version + 1
    });
  }
  return claimed;
}

/** The condition that the claim is still ours and the source has not moved since. */
function stillOurs(item: ClaimedItem) {
  return and(
    eq(searchItems.id, item.id),
    eq(searchItems.lease_version, item.leaseVersion),
    eq(searchItems.source_version, item.sourceVersion)
  );
}

/**
 * Replace the item's body passages and mark it ready, or skipped with a
 * reason. Returns false when the claim was lost or the source changed
 * meanwhile: the item is pending again and the new extraction wins.
 */
export async function completeItem(
  item: ClaimedItem,
  result: { status: "ready"; chunks: ExtractedChunk[] } | { status: "skipped"; reason: string }
): Promise<boolean> {
  const now = new Date().toISOString();
  let removed: string[] = [];
  const done = await withTransaction(async () => {
    const db = getPortableDb();
    const updated = await db
      .update(searchItems)
      .set({
        state: result.status,
        error: result.status === "skipped" ? result.reason : null,
        lease_owner: null,
        lease_expires_at: null,
        next_attempt_at: null,
        indexed_at: now
      })
      .where(stillOurs(item))
      .returning({ id: searchItems.id });
    if (updated.length === 0) return false;
    // Body passages are every chunk neither the inline write nor enrichment owns.
    const owned = await db
      .select({ id: searchChunks.id, field: searchChunks.field })
      .from(searchChunks)
      .where(eq(searchChunks.item_id, item.id));
    const stale = owned
      .filter((chunk) => !(KEPT_FIELDS as readonly string[]).includes(chunk.field))
      .map((chunk) => chunk.id);
    for (let start = 0; start < stale.length; start += 500) {
      await db.delete(searchChunks).where(inArray(searchChunks.id, stale.slice(start, start + 500)));
    }
    if (result.status === "ready") {
      const rows = result.chunks
        .filter((chunk) => chunk.text.trim())
        .map((chunk, ordinal) => ({
          id: `${item.id}_b${ordinal}`,
          item_id: item.id,
          ordinal,
          field: chunk.field,
          text: chunk.text,
          locator: chunk.locator ?? null
        }));
      for (let start = 0; start < rows.length; start += 200) {
        await db.insert(searchChunks).values(rows.slice(start, start + 200));
      }
      const kept = new Set(rows.map((row) => row.id));
      removed = stale.filter((id) => !kept.has(id));
    } else {
      removed = stale;
    }
    return true;
  });
  // Chunk ids are reused, so a replaced chunk's vector is overwritten when it
  // is embedded again. Only ids that are gone need their vectors removed.
  if (removed.length > 0) await removeChunkVectors(item.userId, removed);
  return done;
}

/** Record a failed attempt: retry with backoff, or stay `failed` after the last one. */
export async function failItem(item: ClaimedItem, reason: string, now = new Date()): Promise<void> {
  const attempts = item.attempts + 1;
  const last = attempts >= MAX_ATTEMPTS;
  await getPortableDb()
    .update(searchItems)
    .set({
      state: last ? "failed" : "pending",
      attempts,
      error: reason.slice(0, 2000),
      next_attempt_at: last
        ? null
        : new Date(now.getTime() + RETRY_BASE_MS * 2 ** (attempts - 1)).toISOString(),
      lease_owner: null,
      lease_expires_at: null
    })
    .where(stillOurs(item));
}

/**
 * Put a claimed item whose source row is gone out of the index. The delete is
 * conditional on the claim and the source version, and the source row is
 * checked again inside the transaction, so a source that came back or was
 * rewritten meanwhile keeps its item. Returns whether the item was removed.
 */
export async function dropClaimedItem(item: ClaimedItem): Promise<boolean> {
  const chunkIds = await withTransaction(async (): Promise<string[] | null> => {
    const present = await existingSourceIds(item.resourceType, item.userId, [item.resourceId]);
    if (present.size > 0) return null;
    const db = getPortableDb();
    const removed = await db
      .delete(searchItems)
      .where(stillOurs(item))
      .returning({ id: searchItems.id });
    if (removed.length === 0) return null;
    const chunks = await db
      .delete(searchChunks)
      .where(eq(searchChunks.item_id, item.id))
      .returning({ id: searchChunks.id });
    return chunks.map((chunk) => chunk.id);
  });
  if (chunkIds === null) return false;
  if (chunkIds.length > 0) await removeChunkVectors(item.userId, chunkIds);
  return true;
}

/** Make every failed and skipped item of an owner, or of everyone, pending again. */
export async function retryFailedItems(userId?: string): Promise<number> {
  const rows = await getPortableDb()
    .update(searchItems)
    .set({ state: "pending", attempts: 0, next_attempt_at: null, error: null })
    .where(
      and(
        inArray(searchItems.state, ["failed", "skipped"]),
        userId ? eq(searchItems.user_id, userId) : undefined
      )
    )
    .returning({ id: searchItems.id });
  return rows.length;
}
