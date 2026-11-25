/**
 * The embed step of the indexer (docs/plans/library-search.md, D14.3): give
 * every chunk a vector in the configured space. A chunk whose
 * `embedding_space` differs is embedded again, so a model change rebuilds the
 * index in the background and resumes where it stopped (D11). When an owner
 * has no chunk left outside the new space, the old collections are dropped.
 */

import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNotNull, isNull, like, lt, ne, notInArray, or, sql, sum } from "drizzle-orm";
import { createLogger } from "@nodetool-ai/config";
import { getPortableDb, predictions, searchChunks, searchItems } from "@nodetool-ai/models";
import {
  dropLibraryCollections,
  embeddingDailySpendLimit,
  excludedEmbeddingProjects,
  IN_PROCESS_EMBEDDING_PROVIDERS,
  libraryCollection,
  libraryEmbedder,
  libraryEmbeddingSpace,
  LIBRARY_PARTITION_KEY,
  normalize,
  removeChunkVectors,
  type EmbeddingSpace
} from "./semantic.js";
import { acquireSearchLease, releaseSearchLease } from "./leases.js";

const log = createLogger("nodetool.search.embed");

/** Chunks embedded in one provider call. */
export const EMBED_BATCH_SIZE = 32;
/** Job id prefix of hosted embedding calls, so their cost can be summed. */
export const EMBED_JOB_PREFIX = "library-search-";
/** How long an embed claim holds an item, and the budget lease a paid call. */
export const EMBED_LEASE_MS = 5 * 60 * 1000;
/** The lease a process holds while it checks the day's hosted spend and makes the paid call. */
export const EMBED_BUDGET_LEASE = "library-embedding-budget";

export interface EmbedPass {
  embedded: number;
  /**
   * Why the pass stopped early, if it did: the daily spend limit is reached,
   * or another indexer holds the budget lease for its paid call.
   */
  stopped?: "spend_limit" | "budget_busy";
}

/** Chunks of `userId` (or every owner) that lack a vector in `space`, outside excluded projects. */
function unembeddedCondition(space: EmbeddingSpace, excluded: readonly string[], userId?: string) {
  const parts = [
    ne(searchItems.state, "excluded"),
    or(isNull(searchChunks.embedding_space), ne(searchChunks.embedding_space, space.id))
  ];
  if (excluded.length > 0) parts.push(notInArray(searchItems.project_id, [...excluded]));
  if (userId) parts.push(eq(searchItems.user_id, userId));
  return and(...parts);
}

/** How many of an owner's chunks still need a vector in `space`. */
export async function unembeddedChunkCount(userId: string, space: EmbeddingSpace): Promise<number> {
  const excluded = await excludedEmbeddingProjects();
  const [row] = await getPortableDb()
    .select({ n: sql<number>`COUNT(*)` })
    .from(searchChunks)
    .innerJoin(searchItems, eq(searchItems.id, searchChunks.item_id))
    .where(unembeddedCondition(space, excluded, userId));
  return Number(row?.n ?? 0);
}

/** US dollars hosted library embedding cost since midnight UTC. */
async function spentToday(): Promise<number> {
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const [row] = await getPortableDb()
    .select({ total: sum(predictions.cost) })
    .from(predictions)
    .where(and(like(predictions.job_id, `${EMBED_JOB_PREFIX}%`), gte(predictions.created_at, midnight.toISOString())));
  return Number(row?.total ?? 0);
}

/** The text a chunk is embedded as: its item title gives a short passage its subject. */
function embeddingText(title: string, field: string, text: string): string {
  return field === "title" ? text : `${title}\n\n${text}`;
}

/**
 * Remove the vectors of chunks in projects that are now excluded, so their
 * text stops answering queries by meaning (D27).
 */
async function dropExcludedVectors(excluded: readonly string[]): Promise<void> {
  if (excluded.length === 0) return;
  const rows = await getPortableDb()
    .select({ id: searchChunks.id, userId: searchItems.user_id })
    .from(searchChunks)
    .innerJoin(searchItems, eq(searchItems.id, searchChunks.item_id))
    .where(and(inArray(searchItems.project_id, [...excluded]), isNotNull(searchChunks.embedding_space)));
  const byUser = new Map<string, string[]>();
  for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.id]);
  for (const [userId, ids] of byUser) {
    await removeChunkVectors(userId, ids);
    for (let start = 0; start < ids.length; start += 500) {
      await getPortableDb()
        .update(searchChunks)
        .set({ embedding_space: null })
        .where(inArray(searchChunks.id, ids.slice(start, start + 500)));
    }
  }
}

/**
 * Claim items for embedding with the item lease the extractor uses, so two
 * indexers never embed, and pay for, the same chunks. Returns the lease
 * version won for each claimed item.
 */
async function claimForEmbedding(itemIds: readonly string[], owner: string, now: Date): Promise<Map<string, number>> {
  const db = getPortableDb();
  const at = now.toISOString();
  const expires = new Date(now.getTime() + EMBED_LEASE_MS).toISOString();
  const won = new Map<string, number>();
  for (const id of itemIds) {
    const rows = await db
      .update(searchItems)
      .set({
        lease_owner: owner,
        lease_expires_at: expires,
        lease_version: sql`${searchItems.lease_version} + 1`
      })
      .where(
        and(
          eq(searchItems.id, id),
          or(isNull(searchItems.lease_expires_at), lt(searchItems.lease_expires_at, at))
        )
      )
      .returning({ id: searchItems.id, version: searchItems.lease_version });
    if (rows[0]) won.set(rows[0].id, rows[0].version);
  }
  return won;
}

async function releaseEmbeddingClaims(claims: ReadonlyMap<string, number>): Promise<void> {
  const db = getPortableDb();
  for (const [id, version] of claims) {
    await db
      .update(searchItems)
      .set({ lease_owner: null, lease_expires_at: null })
      .where(and(eq(searchItems.id, id), eq(searchItems.lease_version, version)));
  }
}

/**
 * Embed chunks that lack a vector in the configured space, newest and
 * highest-priority items first, until none are left or `limit` chunks were
 * embedded. Does nothing without a configured space and an embedder.
 *
 * Each batch claims its items first. A hosted model is called only while
 * this process holds the budget lease, after checking the day's spend under
 * it, so concurrent indexers cannot together spend past the limit.
 */
export async function runEmbedPass(
  options: { limit?: number; batchSize?: number; signal?: AbortSignal; owner?: string } = {}
): Promise<EmbedPass> {
  const pass: EmbedPass = { embedded: 0 };
  const space = await libraryEmbeddingSpace();
  const embedder = libraryEmbedder();
  if (!space || !embedder) return pass;
  const excluded = await excludedEmbeddingProjects();
  await dropExcludedVectors(excluded);
  const owner = options.owner ?? `embed:${randomUUID()}`;
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const batchSize = options.batchSize ?? EMBED_BATCH_SIZE;
  const hosted = !IN_PROCESS_EMBEDDING_PROVIDERS.has(space.provider) && space.provider !== "ollama";
  const touched = new Set<string>();

  while (pass.embedded < limit && !options.signal?.aborted) {
    const now = new Date();
    const rows = await getPortableDb()
      .select({
        id: searchChunks.id,
        field: searchChunks.field,
        text: searchChunks.text,
        userId: searchItems.user_id,
        projectId: searchItems.project_id,
        itemId: searchItems.id,
        title: searchItems.title
      })
      .from(searchChunks)
      .innerJoin(searchItems, eq(searchItems.id, searchChunks.item_id))
      .where(
        and(
          unembeddedCondition(space, excluded),
          or(isNull(searchItems.lease_expires_at), lt(searchItems.lease_expires_at, now.toISOString()))
        )
      )
      .orderBy(sql`${searchItems.priority} DESC`, sql`${searchItems.updated_at} DESC`, searchChunks.id)
      .limit(Math.min(batchSize, limit - pass.embedded));
    if (rows.length === 0) break;

    // One owner per provider call keeps the cost on that owner's ledger.
    const userId = rows[0]!.userId;
    const claims = await claimForEmbedding(
      [...new Set(rows.filter((row) => row.userId === userId).map((row) => row.itemId))],
      owner,
      now
    );
    if (claims.size === 0) continue;
    const batch = rows.filter((row) => row.userId === userId && claims.has(row.itemId));
    let budgetHeld = false;
    try {
      if (hosted) {
        budgetHeld = await acquireSearchLease(EMBED_BUDGET_LEASE, owner, EMBED_LEASE_MS);
        if (!budgetHeld) {
          pass.stopped = "budget_busy";
          break;
        }
        const cap = await embeddingDailySpendLimit();
        if (cap !== null && (await spentToday()) >= cap) {
          log.info("Library embedding paused at the daily spend limit", { limit_usd: cap });
          pass.stopped = "spend_limit";
          break;
        }
      }
      const vectors = await embedder.embed(
        batch.map((row) => embeddingText(row.title, row.field, row.text)),
        space,
        userId
      );
      if (budgetHeld) {
        // The call's cost is in the ledger now: the next check sees it.
        await releaseSearchLease(EMBED_BUDGET_LEASE, owner);
        budgetHeld = false;
      }
      if (vectors.length !== batch.length) {
        throw new Error(`The embedding model returned ${vectors.length} vectors for ${batch.length} passages.`);
      }
      const collection = await libraryCollection(userId, space);
      await collection.upsert(
        batch.map((row, index) => ({
          id: row.id,
          embedding: normalize(vectors[index]!),
          metadata: { item_id: row.itemId, [LIBRARY_PARTITION_KEY]: row.projectId }
        }))
      );
      // Mark only chunks whose text and project are still the embedded ones:
      // a chunk the extractor replaced, or an item that moved project,
      // meanwhile keeps its null space and is embedded again.
      const db = getPortableDb();
      for (const row of batch) {
        await db
          .update(searchChunks)
          .set({ embedding_space: space.id })
          .where(
            and(
              eq(searchChunks.id, row.id),
              eq(searchChunks.text, row.text),
              sql`EXISTS (SELECT 1 FROM nodetool_search_items i WHERE i.id = ${row.itemId} AND i.project_id = ${row.projectId})`
            )
          );
      }
      pass.embedded += batch.length;
      touched.add(userId);
    } finally {
      if (budgetHeld) await releaseSearchLease(EMBED_BUDGET_LEASE, owner);
      await releaseEmbeddingClaims(claims);
    }
  }

  // An owner whose chunks are all in the new space no longer needs the old ones.
  for (const userId of touched) {
    if ((await unembeddedChunkCount(userId, space)) === 0) {
      await dropLibraryCollections(userId, space);
    }
  }
  return pass;
}

/** Chunk ids of the given items, for removing their vectors. */
export async function chunkIdsOfItems(itemIds: readonly string[]): Promise<Map<string, string[]>> {
  const byUser = new Map<string, string[]>();
  for (let start = 0; start < itemIds.length; start += 500) {
    const rows = await getPortableDb()
      .select({ id: searchChunks.id, userId: searchItems.user_id })
      .from(searchChunks)
      .innerJoin(searchItems, eq(searchItems.id, searchChunks.item_id))
      .where(inArray(searchChunks.item_id, itemIds.slice(start, start + 500)));
    for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.id]);
  }
  return byUser;
}
