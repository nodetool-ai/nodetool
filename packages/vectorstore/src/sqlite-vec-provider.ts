/**
 * SQLite-vec implementation of the VectorProvider interface.
 *
 * Wraps the existing low-level `SqliteVecStore` / `VecCollection` so callers
 * coding against the abstract interface get an embedded zero-config backend.
 */

import {
  SqliteVecStore,
  VecCollection,
  VecNotFoundError,
  type EmbeddingFunction
} from "./sqlite-vec-store.js";
import {
  CollectionNotFoundError,
  UnsupportedFilterError,
  type CollectionInfo,
  type CollectionMetadata,
  type CreateCollectionOptions,
  type GetCollectionOptions,
  type RecordMetadata,
  type VectorCollection,
  type VectorFilter,
  type VectorMatch,
  type VectorProvider,
  type VectorQuery,
  type VectorRecord
} from "./provider.js";

// ---------------------------------------------------------------------------
// Filter translation: VectorFilter → ChromaDB-style whereDocument used by
// the existing SqliteVecStore. Only document-text predicates are translated;
// metadata predicates would require a schema upgrade and are rejected loudly.
// ---------------------------------------------------------------------------

function translateFilter(
  filter: VectorFilter | undefined
): Record<string, unknown> | undefined {
  if (!filter) return undefined;

  const docPart = filter.$document;
  if (docPart && typeof docPart === "object") {
    return docPart as Record<string, unknown>;
  }

  if ("$contains" in filter || "$or" in filter || "$and" in filter) {
    return filter;
  }

  throw new UnsupportedFilterError(
    `sqlite-vec adapter currently supports only document-text filters ` +
      `($document.$contains / $or). Got keys: ${Object.keys(filter).join(", ")}`
  );
}

function toRecordMetadata(raw: Record<string, unknown> | null): RecordMetadata {
  if (!raw) return {};
  const out: RecordMetadata = {};
  for (const [k, v] of Object.entries(raw)) {
    if (
      v === null ||
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      out[k] = v;
    } else {
      out[k] = JSON.stringify(v);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Collection adapter
// ---------------------------------------------------------------------------

class SqliteVecCollectionAdapter implements VectorCollection {
  constructor(private inner: VecCollection) {}

  get name(): string {
    return this.inner.name;
  }

  get metadata(): CollectionMetadata {
    return this.inner.metadata as CollectionMetadata;
  }

  count(): Promise<number> {
    return this.inner.count();
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;

    const ids: string[] = [];
    const documents: (string | null)[] = [];
    const embeddings: number[][] = [];
    const uris: (string | null)[] = [];
    const metadatas: (Record<string, string | number | boolean> | null)[] = [];

    let withEmbedding = 0;
    for (const r of records) {
      ids.push(r.id);
      documents.push(r.document ?? null);
      uris.push(r.uri ?? null);
      metadatas.push(stripNulls(r.metadata));
      if (r.embedding && r.embedding.length > 0) {
        embeddings.push(r.embedding);
        withEmbedding++;
      } else {
        embeddings.push([]);
      }
    }

    if (withEmbedding > 0 && withEmbedding < records.length) {
      throw new Error(
        "SqliteVecProvider.upsert requires either every record to provide " +
          "an embedding, or none (so the collection's embeddingFunction can " +
          "embed all documents in one batch)."
      );
    }

    await this.inner.upsert({
      ids,
      documents,
      embeddings: withEmbedding > 0 ? embeddings : undefined,
      uris,
      metadatas
    });
  }

  delete(ids: string[]): Promise<void> {
    return this.inner.delete({ ids });
  }

  async get(opts?: {
    ids?: string[];
    limit?: number;
    offset?: number;
  }): Promise<VectorRecord[]> {
    const r = await this.inner.get(opts);
    return r.ids.map((id, i) => ({
      id,
      document: r.documents[i] ?? null,
      metadata: toRecordMetadata(r.metadatas[i] ?? null)
    }));
  }

  async query(query: VectorQuery): Promise<VectorMatch[]> {
    const whereDocument = translateFilter(query.filter);
    const r = await this.inner.query({
      queryTexts: query.text ? [query.text] : undefined,
      queryEmbeddings: query.embedding ? [query.embedding] : undefined,
      queryURIs: query.uri ? [query.uri] : undefined,
      nResults: query.topK ?? 10,
      whereDocument
    });

    const ids = r.ids[0] ?? [];
    const docs = r.documents[0] ?? [];
    const metas = r.metadatas[0] ?? [];
    const dists = r.distances[0] ?? [];

    return ids.map((id, i) => ({
      id,
      document: docs[i] ?? null,
      metadata: toRecordMetadata(metas[i] ?? null),
      uri: null,
      distance: dists[i] ?? 0
    }));
  }

  modify(opts: { name?: string; metadata?: CollectionMetadata }): Promise<void> {
    return this.inner.modify({
      name: opts.name,
      metadata: opts.metadata as Record<string, string | number | boolean>
    });
  }
}

function stripNulls(
  m: RecordMetadata | undefined
): Record<string, string | number | boolean> | null {
  if (!m) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(m)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface SqliteVecProviderOptions {
  /** Path to the SQLite database file. Defaults to NodeTool's config path. */
  dbPath?: string;
  /**
   * Re-use an existing store instance instead of creating one. Useful in tests
   * and when sharing the underlying connection with code that uses the
   * lower-level `SqliteVecStore` API directly.
   */
  store?: SqliteVecStore;
  /**
   * Default embedding function applied to collections fetched without one.
   */
  defaultEmbeddingFunction?: EmbeddingFunction;
}

export class SqliteVecProvider implements VectorProvider {
  readonly name = "sqlite-vec";
  private readonly store: SqliteVecStore;
  private readonly ownsStore: boolean;
  private readonly defaultEf?: EmbeddingFunction;

  constructor(opts: SqliteVecProviderOptions = {}) {
    this.store = opts.store ?? new SqliteVecStore(opts.dbPath);
    this.ownsStore = !opts.store;
    this.defaultEf = opts.defaultEmbeddingFunction;
  }

  /** Escape hatch for callers that need the underlying store. */
  get rawStore(): SqliteVecStore {
    return this.store;
  }

  async listCollections(): Promise<CollectionInfo[]> {
    const cols = await this.store.listCollections();
    return cols.map((c) => ({
      name: c.name,
      metadata: c.metadata as CollectionMetadata
    }));
  }

  async getCollection(opts: GetCollectionOptions): Promise<VectorCollection> {
    try {
      const inner = await this.store.getCollection({
        name: opts.name,
        embeddingFunction: opts.embeddingFunction ?? this.defaultEf ?? null
      });
      return new SqliteVecCollectionAdapter(inner);
    } catch (e) {
      if (e instanceof VecNotFoundError) {
        throw new CollectionNotFoundError(opts.name);
      }
      throw e;
    }
  }

  async createCollection(
    opts: CreateCollectionOptions
  ): Promise<VectorCollection> {
    const metadata = opts.metadata
      ? (Object.fromEntries(
          Object.entries(opts.metadata).filter(([, v]) => v !== null)
        ) as Record<string, string | number | boolean>)
      : undefined;
    const inner = await this.store.createCollection({
      name: opts.name,
      metadata,
      embeddingFunction: opts.embeddingFunction ?? this.defaultEf ?? null
    });
    return new SqliteVecCollectionAdapter(inner);
  }

  async getOrCreateCollection(
    opts: CreateCollectionOptions
  ): Promise<VectorCollection> {
    try {
      return await this.getCollection(opts);
    } catch (e) {
      if (e instanceof CollectionNotFoundError) {
        return this.createCollection(opts);
      }
      throw e;
    }
  }

  async deleteCollection(name: string): Promise<void> {
    try {
      await this.store.deleteCollection({ name });
    } catch (e) {
      if (e instanceof VecNotFoundError) {
        throw new CollectionNotFoundError(name);
      }
      throw e;
    }
  }

  close(): void {
    if (this.ownsStore) this.store.close();
  }
}
