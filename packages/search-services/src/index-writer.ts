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
import { EXTRACTOR_VERSION, type ExtractedItem } from "./extract.js";

/** `|a|b|`, so a filter on one tag is a `LIKE '%|a|%'` match. */
export function encodeTags(tags: readonly string[]): string | null {
  return tags.length > 0 ? `|${tags.join("|")}|` : null;
}

/**
 * Replace the item for `extracted.resourceId` and all of its chunks in one
 * transaction. The item is `ready`: everything step A1 indexes comes from the
 * row, so nothing is left for an indexer.
 */
export async function writeIndexedItem(extracted: ExtractedItem): Promise<void> {
  const now = new Date().toISOString();
  await withTransaction(async () => {
    const db = getPortableDb();
    const [existing] = await db
      .select({ id: searchItems.id })
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
      state: "ready",
      attempts: 0,
      next_attempt_at: null,
      error: null,
      created_at: extracted.createdAt,
      updated_at: extracted.updatedAt,
      indexed_at: now
    };
    if (existing) {
      await db.update(searchItems).set(row).where(eq(searchItems.id, itemId));
      await db.delete(searchChunks).where(eq(searchChunks.item_id, itemId));
    } else {
      await db.insert(searchItems).values({ id: itemId, ...row });
    }
    const chunks = extracted.chunks.filter((chunk) => chunk.text.trim());
    if (chunks.length > 0) {
      await db.insert(searchChunks).values(
        chunks.map((chunk, ordinal) => ({
          id: `${itemId}_${ordinal}`,
          item_id: itemId,
          ordinal,
          field: chunk.field,
          text: chunk.text,
          locator: chunk.locator ?? null
        }))
      );
    }
  });
}

/** Remove items and their chunks. Ids are item ids. */
export async function deleteItemsById(itemIds: readonly string[]): Promise<void> {
  if (itemIds.length === 0) return;
  await withTransaction(async () => {
    const db = getPortableDb();
    for (let start = 0; start < itemIds.length; start += 500) {
      const batch = itemIds.slice(start, start + 500);
      await db.delete(searchChunks).where(inArray(searchChunks.item_id, batch));
      await db.delete(searchItems).where(inArray(searchItems.id, batch));
    }
  });
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
 * skipped item has no chunks and no query returns it.
 */
export async function writeSkippedItem(
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
    state: "skipped",
    created_at: now,
    updated_at: now,
    indexed_at: now
  });
}
