/**
 * The one query function every search surface calls
 * (docs/plans/library-search.md, D16). The lexical layer always runs. When
 * search by meaning is set up, the vector layer runs too and the two rankings
 * merge by reciprocal rank fusion (`hybrid` mode).
 */

import { and, count, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  getDatabase,
  getPortableDb,
  searchChunks,
  searchItems
} from "@nodetool-ai/models";
import type {
  SearchField,
  SearchKind,
  SearchMetadata,
  SearchResourceType
} from "@nodetool-ai/protocol";
import { unembeddedChunkCount } from "./embed.js";
import { deleteItemsById } from "./index-writer.js";
import {
  embedLibraryQuery,
  existingLibraryCollection,
  libraryCollections,
  libraryEmbeddingSpace,
  removeChunkVectors,
  similarityOf,
  type EmbeddingSpace
} from "./semantic.js";
import type { VectorQuery } from "@nodetool-ai/vectorstore";
import { existingSourceIds } from "./sources.js";
import { ensureLibraryIndexed } from "./sync.js";

export interface LibrarySearchFilter {
  createdAfter?: string;
  createdBefore?: string;
  provider?: string;
  model?: string;
  workflowId?: string;
  /** Every tag must be present. */
  tags?: string[];
  favorite?: boolean;
  /** Folder path prefix, such as `Home/Renders` or `shots/day-1`. */
  folder?: string;
  /** Content type prefix, such as `image/` or `image/png`. */
  contentType?: string;
}

export interface LibrarySearchRequest {
  userId: string;
  /** Words or a phrase. Empty lists matching items, newest first. */
  query: string;
  kinds?: readonly SearchKind[];
  /** Restrict to one project. Omitted searches every project. */
  projectId?: string;
  filter?: LibrarySearchFilter;
  /** Default 20, at most 200. */
  limit?: number;
  cursor?: string | null;
  /**
   * `auto` (default) uses both layers when it can. `keyword` matches words
   * only. `semantic` ranks by meaning only and falls back to words when the
   * vector layer is unavailable.
   */
  mode?: LibrarySearchMode;
}

export type LibrarySearchMode = "auto" | "keyword" | "semantic";

export interface LibrarySearchMatch {
  field: SearchField;
  snippet: string;
  locator: Record<string, unknown> | null;
}

export interface LibrarySearchHit {
  itemId: string;
  resourceType: SearchResourceType;
  resourceId: string;
  kind: SearchKind;
  title: string;
  projectId: string;
  folderPath: string | null;
  contentType: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: SearchMetadata | null;
  /** Why the item matched, best passage first. Empty for an empty query. */
  matches: LibrarySearchMatch[];
}

export interface LibrarySearchIndexState {
  /** The layers this answer used. */
  mode: "hybrid" | "semantic" | "keyword";
  pending: number;
  failed: number;
  /** Why the answer matched words only although search by meaning is set up. */
  note?: string;
}

export interface LibrarySearchResult {
  hits: LibrarySearchHit[];
  nextCursor: string | null;
  /** Every item that matches, across pages. */
  total: number;
  index: LibrarySearchIndexState;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;
const MATCHES_PER_HIT = 3;
const SNIPPET_CHARS = 160;
/** Queries shorter than this match the start of a title only (D16). */
const MIN_FULL_QUERY_CHARS = 3;
/** How deep each layer ranks before fusion. */
const FUSION_DEPTH = 200;
/** Nearest chunks the vector layer reads. */
const SEMANTIC_DEPTH = 100;
/** Least cosine similarity for a vector hit to count as a match. */
export const MIN_SEMANTIC_SIMILARITY = 0.25;
/** The usual reciprocal rank fusion constant. */
const RRF_K = 60;

/** The words of a query, lower-cased, as both tokenizers split them. */
export function queryTerms(query: string): string[] {
  return query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

function parseCursor(cursor: string | null | undefined): number {
  const offset = cursor ? Number.parseInt(cursor, 10) : 0;
  return Number.isFinite(offset) && offset > 0 ? offset : 0;
}

/** The conditions on `i` (the item table) every query shares. */
function itemConditions(request: LibrarySearchRequest): SQL {
  const parts: SQL[] = [
    sql`i.user_id = ${request.userId}`,
    sql`i.state <> 'excluded'`,
    // Items of a deleted project stay until the purge removes the rows.
    sql`i.project_id NOT IN (SELECT p.id FROM projects p WHERE p.deleted_at IS NOT NULL)`
  ];
  if (request.projectId) parts.push(sql`i.project_id = ${request.projectId}`);
  if (request.kinds && request.kinds.length > 0) {
    parts.push(sql`i.kind IN (${sql.join(request.kinds.map((kind) => sql`${kind}`), sql`, `)})`);
  }
  const filter = request.filter ?? {};
  if (filter.createdAfter) parts.push(sql`i.created_at >= ${filter.createdAfter}`);
  if (filter.createdBefore) parts.push(sql`i.created_at < ${filter.createdBefore}`);
  if (filter.provider) parts.push(sql`i.provider = ${filter.provider}`);
  if (filter.model) parts.push(sql`i.model = ${filter.model}`);
  if (filter.workflowId) parts.push(sql`i.workflow_id = ${filter.workflowId}`);
  if (filter.favorite) parts.push(sql`i.favorite = 1`);
  if (filter.contentType) {
    parts.push(sql`i.content_type LIKE ${`${escapeLike(filter.contentType)}%`} ESCAPE '\\'`);
  }
  if (filter.folder) {
    let folder = filter.folder;
    while (folder.endsWith("/")) folder = folder.slice(0, -1);
    parts.push(
      sql`(i.folder_path = ${folder} OR i.folder_path LIKE ${`${escapeLike(folder)}/%`} ESCAPE '\\')`
    );
  }
  for (const tag of filter.tags ?? []) {
    const normalized = tag.trim().toLowerCase();
    if (normalized) {
      parts.push(sql`i.tags LIKE ${`%|${escapeLike(normalized)}|%`} ESCAPE '\\'`);
    }
  }
  return sql.join(parts, sql` AND `);
}

interface RankedRow {
  id: string;
}

async function runRows<T>(query: SQL): Promise<T[]> {
  const connection = getDatabase();
  if (connection.dialect === "sqlite") {
    return connection.db.all<T>(query);
  }
  // postgres.js answers with the rows; other drivers wrap them in `rows`.
  const result: unknown = await connection.db.execute(query);
  if (Array.isArray(result)) return [...(result as T[])];
  return [...((result as { rows: T[] }).rows ?? [])];
}

/**
 * The ranked page of item ids and the total. With terms, an item matches when
 * any chunk matches every term as a word prefix, or when its title contains
 * the query as a substring; full-text hits rank first, by relevance. Without
 * terms, items are listed newest first.
 */
async function rankItems(
  request: LibrarySearchRequest,
  limit: number,
  offset: number
): Promise<{ ids: string[]; total: number }> {
  const where = itemConditions(request);
  const raw = request.query.trim();
  const terms = queryTerms(raw);
  const dialect = getDatabase().dialect;

  if (!raw) {
    const rows = await runRows<RankedRow>(
      sql`SELECT i.id AS id FROM nodetool_search_items i WHERE ${where}
          ORDER BY i.created_at DESC, i.id DESC LIMIT ${limit} OFFSET ${offset}`
    );
    const [totalRow] = await runRows<{ n: number | string }>(
      sql`SELECT COUNT(*) AS n FROM nodetool_search_items i WHERE ${where}`
    );
    return { ids: rows.map((row) => row.id), total: Number(totalRow?.n ?? 0) };
  }

  const lowered = raw.toLowerCase();
  if (raw.length < MIN_FULL_QUERY_CHARS || terms.length === 0) {
    const pattern =
      terms.length === 0 ? `%${escapeLike(lowered)}%` : `${escapeLike(lowered)}%`;
    const titleMatch = sql`LOWER(i.title) LIKE ${pattern} ESCAPE '\\'`;
    const rows = await runRows<RankedRow>(
      sql`SELECT i.id AS id FROM nodetool_search_items i WHERE ${where} AND ${titleMatch}
          ORDER BY i.updated_at DESC, i.id DESC LIMIT ${limit} OFFSET ${offset}`
    );
    const [totalRow] = await runRows<{ n: number | string }>(
      sql`SELECT COUNT(*) AS n FROM nodetool_search_items i WHERE ${where} AND ${titleMatch}`
    );
    return { ids: rows.map((row) => row.id), total: Number(totalRow?.n ?? 0) };
  }

  const titleContains = sql`LOWER(i.title) LIKE ${`%${escapeLike(lowered)}%`} ESCAPE '\\'`;
  let hits: SQL;
  let order: SQL;
  if (dialect === "sqlite") {
    const match = terms.map((term) => `"${term}"*`).join(" ");
    // `rank` is FTS5's bm25 score. The bm25() function itself is not allowed
    // inside an aggregate, the hidden column is.
    hits = sql`SELECT c.item_id AS item_id, MIN(nodetool_search_chunks_fts.rank) AS best
      FROM nodetool_search_chunks_fts
      JOIN nodetool_search_chunks c ON c.rowid = nodetool_search_chunks_fts.rowid
      JOIN nodetool_search_items si ON si.id = c.item_id AND si.user_id = ${request.userId}
      WHERE nodetool_search_chunks_fts MATCH ${match}
      GROUP BY c.item_id`;
    // bm25 is lower for a better match.
    order = sql`(h.best IS NULL), h.best ASC`;
  } else {
    const tsquery = terms.map((term) => `${term}:*`).join(" & ");
    hits = sql`SELECT c.item_id AS item_id, MAX(ts_rank(c.text_tsv, to_tsquery('simple', ${tsquery}))) AS best
      FROM nodetool_search_chunks c
      JOIN nodetool_search_items si ON si.id = c.item_id AND si.user_id = ${request.userId}
      WHERE c.text_tsv @@ to_tsquery('simple', ${tsquery})
      GROUP BY c.item_id`;
    order = sql`(h.best IS NULL), h.best DESC`;
  }
  const matched = sql`FROM nodetool_search_items i LEFT JOIN (${hits}) h ON h.item_id = i.id
    WHERE ${where} AND (h.item_id IS NOT NULL OR ${titleContains})`;
  const rows = await runRows<RankedRow>(
    sql`SELECT i.id AS id ${matched} ORDER BY ${order}, i.updated_at DESC, i.id DESC
        LIMIT ${limit} OFFSET ${offset}`
  );
  const [totalRow] = await runRows<{ n: number | string }>(sql`SELECT COUNT(*) AS n ${matched}`);
  return { ids: rows.map((row) => row.id), total: Number(totalRow?.n ?? 0) };
}

/** Merge rankings by reciprocal rank fusion: each list adds 1 / (k + rank) to an id's score. */
export function fuseRankings(rankings: readonly (readonly string[])[], k = RRF_K): string[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1)));
  }
  // Map iteration keeps first-seen order, so ties keep the earlier list's order.
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

interface SemanticRanking {
  /** Item ids, nearest first. */
  ids: string[];
  /** Matching chunk ids per item, nearest first. */
  chunks: Map<string, string[]>;
}

const UNAVAILABLE_NOTE = "Search by meaning is unavailable right now, so results match words only.";
const NOT_READY_NOTE = "Search by meaning is still indexing, so results match words only.";

/**
 * The space to answer from: the configured one, or during a rebuild the old
 * one that is still complete (D11).
 */
async function answeringSpace(userId: string, space: EmbeddingSpace): Promise<EmbeddingSpace> {
  if ((await unembeddedChunkCount(userId, space)) === 0) return space;
  const older = (await libraryCollections(userId)).find((collection) => collection.space.id !== space.id);
  return older?.space ?? space;
}

/** Rank items by meaning, or explain why that is not possible. Null when it is not set up. */
async function rankByMeaning(
  request: LibrarySearchRequest,
  query: string
): Promise<SemanticRanking | { note: string } | null> {
  const configured = await libraryEmbeddingSpace();
  if (!configured) return null;
  const space = await answeringSpace(request.userId, configured);
  const collection = await existingLibraryCollection(request.userId, space);
  if (!collection) return { note: NOT_READY_NOTE };
  let vector: number[] | null = null;
  try {
    vector = await embedLibraryQuery(query, space, request.userId);
  } catch {
    vector = null;
  }
  if (!vector) return { note: UNAVAILABLE_NOTE };
  const vectorQuery: VectorQuery = { embedding: vector, topK: SEMANTIC_DEPTH };
  if (request.projectId) vectorQuery.partition = request.projectId;
  const hits = await collection.query(vectorQuery);
  const near = hits.filter((hit) => similarityOf(hit.distance) >= MIN_SEMANTIC_SIMILARITY);
  if (near.length === 0) return { ids: [], chunks: new Map() };
  const chunkIds = near.map((hit) => hit.id);
  // Joined under the caller's id and filters: a vector can never return another owner's item.
  const rows = await runRows<{ chunk_id: string; item_id: string }>(
    sql`SELECT c.id AS chunk_id, c.item_id AS item_id FROM nodetool_search_chunks c
        JOIN nodetool_search_items i ON i.id = c.item_id
        WHERE c.id IN (${sql.join(chunkIds.map((id) => sql`${id}`), sql`, `)}) AND ${itemConditions(request)}`
  );
  const itemOf = new Map(rows.map((row) => [row.chunk_id, row.item_id]));
  if (itemOf.size < chunkIds.length) {
    const present = await getPortableDb()
      .select({ id: searchChunks.id })
      .from(searchChunks)
      .where(inArray(searchChunks.id, chunkIds));
    const known = new Set(present.map((row) => row.id));
    const gone = chunkIds.filter((id) => !known.has(id));
    if (gone.length > 0) await removeChunkVectors(request.userId, gone);
  }
  const ids: string[] = [];
  const chunks = new Map<string, string[]>();
  for (const chunkId of chunkIds) {
    const itemId = itemOf.get(chunkId);
    if (!itemId) continue;
    if (!chunks.has(itemId)) ids.push(itemId);
    chunks.set(itemId, [...(chunks.get(itemId) ?? []), chunkId]);
  }
  return { ids, chunks };
}

interface Ranked {
  ids: string[];
  total: number;
  mode: LibrarySearchIndexState["mode"];
  note?: string;
  chunks: Map<string, string[]>;
}

/** Run the layers the request and the setup allow, and merge them. */
async function rankRequest(request: LibrarySearchRequest, limit: number, offset: number): Promise<Ranked> {
  const raw = request.query.trim();
  const lexicalOnly =
    request.mode === "keyword" || raw.length < MIN_FULL_QUERY_CHARS || queryTerms(raw).length === 0;
  const semantic = lexicalOnly ? null : await rankByMeaning(request, raw);
  if (semantic === null || "note" in semantic) {
    const lexical: Ranked = { ...(await rankItems(request, limit, offset)), mode: "keyword", chunks: new Map() };
    if (semantic) lexical.note = semantic.note;
    return lexical;
  }
  if (request.mode === "semantic") {
    return {
      ids: semantic.ids.slice(offset, offset + limit),
      total: semantic.ids.length,
      mode: "semantic",
      chunks: semantic.chunks
    };
  }
  const lexical = await rankItems(request, FUSION_DEPTH, 0);
  const fused = fuseRankings([lexical.ids, semantic.ids]);
  return {
    ids: fused.slice(offset, offset + limit),
    total: fused.length + Math.max(0, lexical.total - lexical.ids.length),
    mode: "hybrid",
    chunks: semantic.chunks
  };
}

/** A window of `text` around the first term it contains. */
export function snippetOf(text: string, terms: readonly string[]): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= SNIPPET_CHARS) return flat;
  const lower = flat.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const index = lower.indexOf(term);
    if (index >= 0 && (at < 0 || index < at)) at = index;
  }
  const start = Math.max(0, Math.min(at < 0 ? 0 : at - 40, flat.length - SNIPPET_CHARS));
  const window = flat.slice(start, start + SNIPPET_CHARS);
  return `${start > 0 ? "…" : ""}${window}${start + SNIPPET_CHARS < flat.length ? "…" : ""}`;
}

const FIELD_ORDER: Record<string, number> = {
  title: 0,
  prompt: 1,
  description: 2,
  body: 3,
  caption: 4,
  transcript: 5
};

/**
 * The passages of each item that contain a query term, best first. An item
 * that matched by meaning only shows its nearest passages.
 */
async function matchesFor(
  itemIds: readonly string[],
  terms: readonly string[],
  nearest: ReadonlyMap<string, readonly string[]> = new Map()
): Promise<Map<string, LibrarySearchMatch[]>> {
  const out = new Map<string, LibrarySearchMatch[]>();
  if (itemIds.length === 0 || terms.length === 0) return out;
  const chunks = await getPortableDb()
    .select({
      id: searchChunks.id,
      item_id: searchChunks.item_id,
      ordinal: searchChunks.ordinal,
      field: searchChunks.field,
      text: searchChunks.text,
      locator: searchChunks.locator
    })
    .from(searchChunks)
    .where(inArray(searchChunks.item_id, [...itemIds]));
  chunks.sort(
    (a, b) =>
      (FIELD_ORDER[a.field] ?? 9) - (FIELD_ORDER[b.field] ?? 9) || a.ordinal - b.ordinal
  );
  for (const chunk of chunks) {
    const lower = chunk.text.toLowerCase();
    if (!terms.some((term) => lower.includes(term))) continue;
    const list = out.get(chunk.item_id) ?? [];
    if (list.length >= MATCHES_PER_HIT) continue;
    list.push({
      field: chunk.field as SearchField,
      snippet: snippetOf(chunk.text, terms),
      locator: chunk.locator ?? null
    });
    out.set(chunk.item_id, list);
  }
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  for (const [itemId, chunkIds] of nearest) {
    if ((out.get(itemId)?.length ?? 0) > 0) continue;
    const list: LibrarySearchMatch[] = [];
    for (const chunkId of chunkIds.slice(0, MATCHES_PER_HIT)) {
      const chunk = byId.get(chunkId);
      if (!chunk) continue;
      list.push({
        field: chunk.field as SearchField,
        snippet: snippetOf(chunk.text, terms),
        locator: chunk.locator ?? null
      });
    }
    if (list.length > 0) out.set(itemId, list);
  }
  return out;
}

/** Pending and failed item counts for one owner. */
export async function libraryIndexState(userId: string): Promise<LibrarySearchIndexState> {
  const rows = await getPortableDb()
    .select({ state: searchItems.state, n: count() })
    .from(searchItems)
    .where(and(eq(searchItems.user_id, userId), inArray(searchItems.state, ["pending", "failed"])))
    .groupBy(searchItems.state);
  const byState = new Map(rows.map((row) => [row.state, Number(row.n)]));
  return { mode: "keyword", pending: byState.get("pending") ?? 0, failed: byState.get("failed") ?? 0 };
}

/**
 * Search one owner's library. Hits are hydrated against the source rows, so
 * an item whose row was deleted since indexing drops out (and is removed).
 */
export async function searchLibrary(request: LibrarySearchRequest): Promise<LibrarySearchResult> {
  await ensureLibraryIndexed(request.userId);
  const limit = Math.min(Math.max(Math.trunc(request.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const offset = parseCursor(request.cursor);
  const ranked = await rankRequest(request, limit + 1, offset);
  const pageIds = ranked.ids.slice(0, limit);
  const nextCursor = ranked.ids.length > limit ? String(offset + limit) : null;

  const rows = pageIds.length
    ? await getPortableDb()
        .select()
        .from(searchItems)
        .where(and(eq(searchItems.user_id, request.userId), inArray(searchItems.id, pageIds)))
    : [];
  const byId = new Map(rows.map((row) => [row.id, row]));

  // Hydrate: drop items whose source row is gone.
  const gone: string[] = [];
  const idsByType = new Map<SearchResourceType, string[]>();
  for (const row of rows) {
    const type = row.resource_type as SearchResourceType;
    idsByType.set(type, [...(idsByType.get(type) ?? []), row.resource_id]);
  }
  const live = new Set<string>();
  for (const [type, ids] of idsByType) {
    for (const id of await existingSourceIds(type, request.userId, ids)) live.add(`${type}:${id}`);
  }
  for (const row of rows) {
    if (!live.has(`${row.resource_type}:${row.resource_id}`)) gone.push(row.id);
  }
  if (gone.length > 0) await deleteItemsById(gone);

  const terms = queryTerms(request.query);
  const matches = await matchesFor(
    pageIds.filter((id) => !gone.includes(id)),
    terms,
    ranked.chunks
  );
  const hits: LibrarySearchHit[] = [];
  for (const id of pageIds) {
    const row = byId.get(id);
    if (!row || gone.includes(id)) continue;
    hits.push({
      itemId: row.id,
      resourceType: row.resource_type as SearchResourceType,
      resourceId: row.resource_id,
      kind: row.kind as SearchKind,
      title: row.title,
      projectId: row.project_id,
      folderPath: row.folder_path ?? null,
      contentType: row.content_type ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata ?? null,
      matches: matches.get(id) ?? []
    });
  }

  const index: LibrarySearchIndexState = { ...(await libraryIndexState(request.userId)), mode: ranked.mode };
  if (ranked.note) index.note = ranked.note;
  return {
    hits,
    nextCursor,
    total: Math.max(0, ranked.total - gone.length),
    index
  };
}
