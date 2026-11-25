/**
 * Writes to the library index: one item row and its chunks per source row.
 */

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  getPortableDb,
  searchChunks,
  searchItems,
  withTransaction
} from "@nodetool-ai/models";
import type { SearchResourceType } from "@nodetool-ai/protocol";
import { chunkIdsOfItems } from "./embed.js";
import { EXTRACTOR_VERSION, type ExtractedItem } from "./extract.js";
import { removeChunkVectors } from "./semantic.js";

/** `|a|b|`, so a filter on one tag is a `LIKE '%|a|%'` match. */
export function encodeTags(tags: readonly string[]): string | null {
  return tags.length > 0 ? `|${tags.join("|")}|` : null;
}

/** The chunk fields the inline write owns. `body` and the rest belong to the indexer. */
export const METADATA_FIELDS = ["title", "prompt", "description"] as const;

/**
 * Write the item for `extracted.resourceId` and replace its metadata chunks
 * (title, prompt, description) in one transaction (D4). Body chunks stay as
 * they are, so a renamed PDF keeps answering from its pages until the indexer
 * extracts it again.
 *
 * An item whose kind has content to extract becomes `pending` when its source
 * or the extractor changed since it was last built, and keeps its state
 * otherwise. An item with nothing to extract is `ready` at once.
 */
export async function writeIndexedItem(
  extracted: ExtractedItem,
  options: { priority?: number } = {}
): Promise<{ pending: boolean }> {
  const now = new Date().toISOString();
  let removed: string[] = [];
  const written = await withTransaction(async () => {
    const db = getPortableDb();
    const [existing] = await db
      .select({
        id: searchItems.id,
        state: searchItems.state,
        project_id: searchItems.project_id,
        source_version: searchItems.source_version,
        extractor_version: searchItems.extractor_version
      })
      .from(searchItems)
      .where(
        and(
          eq(searchItems.user_id, extracted.userId),
          eq(searchItems.resource_type, extracted.resourceType),
          eq(searchItems.resource_id, extracted.resourceId)
        )
      )
      .limit(1);
    const itemId = existing?.id ?? randomUUID().replace(/-/g, "");
    const unchanged =
      existing !== undefined &&
      existing.state !== "excluded" &&
      existing.source_version === extracted.sourceVersion &&
      existing.extractor_version === EXTRACTOR_VERSION;
    const state = !extracted.hasContent
      ? "ready"
      : unchanged
        ? existing.state
        : "pending";
    const row = {
      user_id: extracted.userId,
      project_id: extracted.projectId,
      resource_type: extracted.resourceType,
      resource_id: extracted.resourceId,
      kind: extracted.kind,
      title: extracted.title,
      content_type: extracted.contentType,
      provider: extracted.provider,
      model: extracted.model,
      workflow_id: extracted.workflowId,
      favorite: extracted.favorite,
      folder_path: extracted.folderPath,
      tags: encodeTags(extracted.tags),
      metadata: extracted.metadata,
      source_version: extracted.sourceVersion,
      extractor_version: EXTRACTOR_VERSION,
      state,
      created_at: extracted.createdAt,
      updated_at: extracted.updatedAt
    };
    const queued =
      state === "pending" && !unchanged
        ? {
            attempts: 0,
            next_attempt_at: null,
            error: null,
            priority: options.priority ?? 0
          }
        : {};
    const settled = state === "ready" && !extracted.hasContent ? { indexed_at: now, error: null } : {};
    const chunks = extracted.chunks.filter((chunk) => chunk.text.trim());
    if (existing) {
      await db
        .update(searchItems)
        .set({ ...row, ...queued, ...settled })
        .where(eq(searchItems.id, itemId));
      if (existing.project_id !== extracted.projectId) {
        // A vector records the project it was written under, and the query
        // partitions on it. Embed the moved item again under its new project.
        await db
          .update(searchChunks)
          .set({ embedding_space: null })
          .where(eq(searchChunks.item_id, itemId));
      }
      const previous = await db
        .select({ id: searchChunks.id })
        .from(searchChunks)
        .where(
          and(eq(searchChunks.item_id, itemId), inArray(searchChunks.field, [...METADATA_FIELDS]))
        );
      removed = previous.map((chunk) => chunk.id).filter((id) => {
        const ordinal = Number(id.slice(id.lastIndexOf("_m") + 2));
        return !(Number.isInteger(ordinal) && ordinal < chunks.length);
      });
      await db
        .delete(searchChunks)
        .where(
          and(eq(searchChunks.item_id, itemId), inArray(searchChunks.field, [...METADATA_FIELDS]))
        );
    } else {
      await db.insert(searchItems).values({ id: itemId, ...row, ...queued, ...settled });
    }
    if (chunks.length > 0) {
      await db.insert(searchChunks).values(
        chunks.map((chunk, ordinal) => ({
          id: `${itemId}_m${ordinal}`,
          item_id: itemId,
          ordinal,
          field: chunk.field,
          text: chunk.text,
          locator: chunk.locator ?? null
        }))
      );
    }
    return { pending: state === "pending" };
  });
  if (removed.length > 0) await removeChunkVectors(extracted.userId, removed);
  return written;
}

/** Remove items and their chunks. Ids are item ids. */
export async function deleteItemsById(itemIds: readonly string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const vectorIds = await chunkIdsOfItems(itemIds);
  await withTransaction(async () => {
    const db = getPortableDb();
    for (let start = 0; start < itemIds.length; start += 500) {
      const batch = itemIds.slice(start, start + 500);
      await db.delete(searchChunks).where(inArray(searchChunks.item_id, batch));
      await db.delete(searchItems).where(inArray(searchItems.id, batch));
    }
  });
  for (const [userId, chunkIds] of vectorIds) await removeChunkVectors(userId, chunkIds);
}

/** Remove the item for one source row, if it has one. */
export async function deleteIndexedItem(
  userId: string,
  resourceType: SearchResourceType,
  resourceId: string
): Promise<void> {
  const rows = await getPortableDb()
    .select({ id: searchItems.id })
    .from(searchItems)
    .where(
      and(
        eq(searchItems.user_id, userId),
        eq(searchItems.resource_type, resourceType),
        eq(searchItems.resource_id, resourceId)
      )
    );
  await deleteItemsById(rows.map((row) => row.id));
}

/**
 * Record a source row that is not a library item, such as a shipped entity
 * preset, so the reconcile does not extract it again until it changes. A
 * excluded item has no chunks and no query returns it.
 */
export async function writeExcludedItem(
  userId: string,
  resourceType: SearchResourceType,
  resourceId: string,
  sourceVersion: string
): Promise<void> {
  const now = new Date().toISOString();
  await deleteIndexedItem(userId, resourceType, resourceId);
  await getPortableDb().insert(searchItems).values({
    id: randomUUID().replace(/-/g, ""),
    user_id: userId,
    resource_type: resourceType,
    resource_id: resourceId,
    kind: "file",
    source_version: sourceVersion,
    extractor_version: EXTRACTOR_VERSION,
    state: "excluded",
    created_at: now,
    updated_at: now,
    indexed_at: now
  });
}
