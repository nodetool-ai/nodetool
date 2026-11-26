/**
 * The image step of the indexer: give every image asset a vector from a
 * multimodal model (CLIP-style), so a text query finds images by what they
 * show and "similar items" compares the pictures themselves, with no caption.
 *
 * The model is set by `NODETOOL_SEARCH_IMAGE_EMBEDDING_MODEL` as
 * `provider:model` and is off by default. Each image item gets one vector, id
 * {@link imageVectorId}, in the owner's image collection for that space. The
 * item row records what the vector was made from in
 * `image_embedded_version` (`source_version|project_id|space`), so a changed
 * file, a move to another project, or a model change embeds it again.
 */

import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull, lt, ne, notInArray, or, sql, inArray } from "drizzle-orm";
import { createLogger } from "@nodetool-ai/config";
import { Asset, getPortableDb, searchItems } from "@nodetool-ai/models";
import { readAssetBytes } from "./content.js";
import { EMBED_LEASE_MS } from "./embed.js";
import { BudgetStop, paidCall } from "./enrich.js";
import { claimItems, itemUnclaimed, releaseItemClaims } from "./leases.js";
import {
  dropLibraryCollections,
  excludedEmbeddingProjects,
  imageVectorId,
  IN_PROCESS_EMBEDDING_PROVIDERS,
  libraryCollection,
  libraryEmbedder,
  libraryImageSpace,
  LIBRARY_PARTITION_KEY,
  normalize,
  removeChunkVectors,
  type EmbeddingSpace,
  type LibraryEmbedder
} from "./semantic.js";

const log = createLogger("nodetool.search.image-embed");

/** Failed attempts before an image is left alone until its file changes. */
export const MAX_IMAGE_EMBED_ATTEMPTS = 3;
/** Largest image file sent to an embedding model. The models resize to a few hundred pixels. */
export const MAX_IMAGE_EMBED_BYTES = 20 * 1024 * 1024;
/** Formats every supported model decodes. */
export const IMAGE_EMBED_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
]);

export interface ImageEmbedPass {
  embedded: number;
  failed: number;
  /** Why the pass stopped early: the daily spend limit, or another indexer's paid call. */
  stopped?: "spend_limit" | "budget_busy";
}

/** What an image vector was made from. A different value means the vector is stale. */
function imageKeySql(space: EmbeddingSpace) {
  return sql`${searchItems.source_version} || '|' || ${searchItems.project_id} || ${`|${space.id}`}`;
}

function imageKey(sourceVersion: string, projectId: string, space: EmbeddingSpace): string {
  return `${sourceVersion}|${projectId}|${space.id}`;
}

/** Image items of `userId` (or every owner) whose vector is missing or stale. */
function staleImageCondition(space: EmbeddingSpace, excluded: readonly string[], userId?: string) {
  const parts = [
    eq(searchItems.kind, "image"),
    eq(searchItems.resource_type, "asset"),
    inArray(searchItems.state, ["ready", "skipped"]),
    lt(searchItems.image_embed_attempts, MAX_IMAGE_EMBED_ATTEMPTS),
    or(isNull(searchItems.image_embedded_version), ne(searchItems.image_embedded_version, imageKeySql(space)))
  ];
  if (excluded.length > 0) parts.push(notInArray(searchItems.project_id, [...excluded]));
  if (userId) parts.push(eq(searchItems.user_id, userId));
  return and(...parts);
}

/** How many of an owner's images still need a vector in `space`. */
export async function unembeddedImageCount(userId: string, space: EmbeddingSpace): Promise<number> {
  const excluded = await excludedEmbeddingProjects();
  const [row] = await getPortableDb()
    .select({ n: sql<number>`COUNT(*)` })
    .from(searchItems)
    .where(staleImageCondition(space, excluded, userId));
  return Number(row?.n ?? 0);
}

/** How many of an owner's images have a current vector in `space`. */
export async function embeddedImageCount(userId: string, space: EmbeddingSpace): Promise<number> {
  const [row] = await getPortableDb()
    .select({ n: sql<number>`COUNT(*)` })
    .from(searchItems)
    .where(
      and(
        eq(searchItems.user_id, userId),
        eq(searchItems.kind, "image"),
        eq(searchItems.image_embedded_version, imageKeySql(space))
      )
    );
  return Number(row?.n ?? 0);
}

interface Candidate {
  id: string;
  userId: string;
  projectId: string;
  resourceId: string;
  sourceVersion: string;
  attempts: number;
}

/** Record the vector (or a reason there is none), unless the item changed meanwhile. */
async function recordImage(item: Candidate, space: EmbeddingSpace, error: string | null): Promise<void> {
  await getPortableDb()
    .update(searchItems)
    .set({ image_embedded_version: imageKey(item.sourceVersion, item.projectId, space), image_embed_error: error })
    .where(
      and(
        eq(searchItems.id, item.id),
        eq(searchItems.source_version, item.sourceVersion),
        eq(searchItems.project_id, item.projectId)
      )
    );
}

async function recordFailure(item: Candidate, reason: string): Promise<void> {
  await getPortableDb()
    .update(searchItems)
    .set({ image_embed_attempts: item.attempts + 1, image_embed_error: reason.slice(0, 2000) })
    .where(and(eq(searchItems.id, item.id), eq(searchItems.source_version, item.sourceVersion)));
}

/**
 * Remove the image vectors of items in projects that are now excluded, so
 * their pictures stop answering queries.
 */
async function dropExcludedImageVectors(excluded: readonly string[]): Promise<void> {
  if (excluded.length === 0) return;
  const rows = await getPortableDb()
    .select({ id: searchItems.id, userId: searchItems.user_id })
    .from(searchItems)
    .where(and(inArray(searchItems.project_id, [...excluded]), isNotNull(searchItems.image_embedded_version)));
  const byUser = new Map<string, string[]>();
  for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.id]);
  for (const [userId, ids] of byUser) {
    await removeChunkVectors(userId, ids.map(imageVectorId));
    for (let start = 0; start < ids.length; start += 500) {
      await getPortableDb()
        .update(searchItems)
        .set({ image_embedded_version: null })
        .where(inArray(searchItems.id, ids.slice(start, start + 500)));
    }
  }
}

/** Embed one claimed image. Returns whether a model was called. */
async function embedOne(
  item: Candidate,
  space: EmbeddingSpace,
  embedImages: NonNullable<LibraryEmbedder["embedImages"]>,
  owner: string,
  hosted: boolean
): Promise<boolean> {
  const asset = await Asset.find(item.userId, item.resourceId);
  if (!asset) return false;
  const contentType = asset.content_type?.toLowerCase() ?? null;
  if (!contentType || !IMAGE_EMBED_CONTENT_TYPES.has(contentType)) {
    await recordImage(item, space, `Images of type ${contentType ?? "unknown"} are not embedded.`);
    return false;
  }
  if (asset.size !== null && asset.size !== undefined && asset.size > MAX_IMAGE_EMBED_BYTES) {
    await recordImage(item, space, `The image is larger than ${MAX_IMAGE_EMBED_BYTES / 1024 / 1024} MB.`);
    return false;
  }
  const bytes = await readAssetBytes(asset);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_EMBED_BYTES) {
    await recordImage(item, space, bytes.byteLength === 0 ? "The image file is empty." : "The image is too large.");
    return false;
  }
  const call = () => embedImages([{ bytes, contentType }], space, item.userId);
  const [vector] = hosted ? await paidCall(owner, call) : await call();
  if (!vector || vector.length === 0) throw new Error(`${space.id} returned no image embedding.`);
  const collection = await libraryCollection(item.userId, space, "image");
  await collection.upsert([
    {
      id: imageVectorId(item.id),
      embedding: normalize(vector),
      metadata: { item_id: item.id, [LIBRARY_PARTITION_KEY]: item.projectId }
    }
  ]);
  await recordImage(item, space, null);
  return true;
}

/**
 * Embed images whose vector is missing or stale, newest and highest-priority
 * first, until none are left or `limit` images were tried. Does nothing
 * without an image model or an embedder that embeds images. A hosted model is
 * called under the budget lease after checking the day's spend, as the text
 * embed pass does. When an owner has no stale image left, image collections
 * of other spaces are dropped.
 */
export async function runImageEmbedPass(
  options: { limit?: number; signal?: AbortSignal; owner?: string } = {}
): Promise<ImageEmbedPass> {
  const pass: ImageEmbedPass = { embedded: 0, failed: 0 };
  const space = await libraryImageSpace();
  const embedder = libraryEmbedder();
  const embedImages = embedder?.embedImages?.bind(embedder);
  if (!space || !embedImages) return pass;
  const excluded = await excludedEmbeddingProjects();
  await dropExcludedImageVectors(excluded);
  const owner = options.owner ?? `image-embed:${randomUUID()}`;
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const hosted = !IN_PROCESS_EMBEDDING_PROVIDERS.has(space.provider) && space.provider !== "ollama";
  const tried = new Set<string>();
  const touched = new Set<string>();

  outer: while (pass.embedded + pass.failed < limit && !options.signal?.aborted) {
    const rows = await getPortableDb()
      .select({
        id: searchItems.id,
        userId: searchItems.user_id,
        projectId: searchItems.project_id,
        resourceId: searchItems.resource_id,
        sourceVersion: searchItems.source_version,
        attempts: searchItems.image_embed_attempts
      })
      .from(searchItems)
      .where(and(staleImageCondition(space, excluded), itemUnclaimed()))
      .orderBy(sql`${searchItems.priority} DESC`, sql`${searchItems.updated_at} DESC`)
      .limit(16 + tried.size);
    const batch = rows.filter((row) => !tried.has(row.id));
    if (batch.length === 0) break;
    for (const item of batch) {
      if (options.signal?.aborted || pass.embedded + pass.failed >= limit) break;
      tried.add(item.id);
      touched.add(item.userId);
      const claims = await claimItems([item.id], owner, EMBED_LEASE_MS);
      if (claims.size === 0) continue;
      try {
        if (await embedOne(item, space, embedImages, owner, hosted)) pass.embedded += 1;
      } catch (error) {
        if (error instanceof BudgetStop) {
          pass.stopped = error.reason;
          break outer;
        }
        pass.failed += 1;
        const reason = error instanceof Error ? error.message : String(error);
        log.warn("Library image embedding failed", { space: space.id, error: reason });
        await recordFailure(item, reason);
      } finally {
        await releaseItemClaims(claims);
      }
    }
  }

  // An owner whose images all have vectors in this space no longer needs older image spaces.
  if (!pass.stopped && !options.signal?.aborted) {
    for (const userId of touched) {
      if ((await unembeddedImageCount(userId, space)) === 0) {
        await dropLibraryCollections(userId, space, "image");
      }
    }
  }
  return pass;
}
