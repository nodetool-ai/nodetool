/**
 * Vector provider abstraction.
 *
 * Defines a backend-agnostic interface for vector collections so callers can
 * use sqlite-vec locally, or hosted services like Pinecone or Supabase
 * (pgvector), behind a single API.
 *
 * Concrete adapters live in sibling files:
 *   - sqlite-vec-provider.ts  → wraps SqliteVecStore (default)
 *   - pinecone-provider.ts    → wraps Pinecone REST/SDK
 *   - supabase-provider.ts    → wraps Supabase + pgvector RPC
 */

import type { EmbeddingFunction } from "./sqlite-vec-store.js";

// ---------------------------------------------------------------------------
// Shared value types
// ---------------------------------------------------------------------------

/** JSON-safe scalar values allowed in collection / record metadata. */
export type MetadataValue = string | number | boolean | null;

/** Free-form metadata attached to a collection. */
export type CollectionMetadata = Record<string, MetadataValue | undefined>;

/** Free-form metadata attached to a single record. */
export type RecordMetadata = Record<string, MetadataValue>;

/**
 * Filter expression applied against record metadata or document text.
 *
 * Adapters SHOULD support at least:
 *   - `{ field: value }`                        — equality
 *   - `{ field: { $in: [v1, v2] } }`            — membership
 *   - `{ field: { $eq | $ne | $gt | $gte | $lt | $lte: v } }`
 *   - `{ $and: [...], $or: [...] }`             — boolean combinators
 *   - `{ $document: { $contains: "..." } }`     — substring on document text
 *
 * Adapters MUST throw `UnsupportedFilterError` for operators they cannot
 * translate, rather than silently dropping conditions.
 */
export type VectorFilter = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Records and query results
// ---------------------------------------------------------------------------

/** A single vector record as accepted by `upsert` / returned by `get`. */
export interface VectorRecord {
  id: string;
  /** Source text. May be omitted if only embeddings are stored. */
  document?: string | null;
  /** Pre-computed embedding. If missing, the collection's embeddingFunction is used. */
  embedding?: number[] | null;
  /** Optional source URI (file path, URL, etc.). */
  uri?: string | null;
  metadata?: RecordMetadata;
}

/** A single match returned by `query`, ordered by ascending distance. */
export interface VectorMatch {
  id: string;
  document: string | null;
  metadata: RecordMetadata;
  uri: string | null;
  /**
   * Provider-native distance (lower = closer for L2/cosine-distance backends).
   * Adapters MUST normalise so callers can sort ascending.
   */
  distance: number;
  /** Optional similarity score in [0, 1] when the backend exposes one. */
  score?: number;
}

export interface VectorQuery {
  /** Query text — embedded via the collection's embeddingFunction. */
  text?: string;
  /** Pre-computed query embedding. Takes precedence over `text`. */
  embedding?: number[];
  /** URI substring search (no vector ranking). */
  uri?: string;
  /** Maximum number of results. Default: 10. */
  topK?: number;
  /** Metadata / document filter applied before ranking. */
  filter?: VectorFilter;
}

export interface CollectionInfo {
  name: string;
  metadata: CollectionMetadata;
  /** Vector dimension if known; 0 / undefined for empty collections. */
  dimension?: number;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

/**
 * A handle to a single vector collection / index.
 *
 * All methods are async — even when the underlying backend is local — so
 * callers can swap providers without changing call sites.
 */
export interface VectorCollection {
  readonly name: string;
  readonly metadata: CollectionMetadata;

  /** Number of records currently stored. */
  count(): Promise<number>;

  /** Insert or update by id. Embeddings are generated on demand if missing. */
  upsert(records: VectorRecord[]): Promise<void>;

  /** Delete records by id. No-op for ids that do not exist. */
  delete(ids: string[]): Promise<void>;

  /**
   * Fetch records by id, or page through the collection.
   * If `ids` is provided, results are returned in the same order
   * (with `null` placeholders omitted).
   */
  get(opts?: {
    ids?: string[];
    limit?: number;
    offset?: number;
  }): Promise<VectorRecord[]>;

  /** Vector / text / URI search. Results sorted by ascending distance. */
  query(query: VectorQuery): Promise<VectorMatch[]>;

  /** Mutate the collection's name and/or metadata in place. */
  modify(opts: { name?: string; metadata?: CollectionMetadata }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface CreateCollectionOptions {
  name: string;
  metadata?: CollectionMetadata;
  /**
   * Embedding function used by the collection when records or queries are
   * provided as raw text. Optional — callers may pass embeddings directly.
   */
  embeddingFunction?: EmbeddingFunction | null;
  /**
   * Vector dimension. Required by remote providers that pre-allocate indexes
   * (Pinecone, Supabase). Optional for sqlite-vec which infers from the
   * first stored embedding.
   */
  dimension?: number;
  /**
   * Distance metric. Defaults to whatever the backend uses natively
   * (cosine for Pinecone/pgvector, L2 for sqlite-vec).
   */
  metric?: DistanceMetric;
}

export interface GetCollectionOptions {
  name: string;
  embeddingFunction?: EmbeddingFunction | null;
}

export type DistanceMetric = "cosine" | "l2" | "ip";

/**
 * A vector store backend. Manages a set of named collections.
 *
 * Implementations:
 *   - `SqliteVecProvider`  — local, embedded
 *   - `PineconeProvider`   — hosted (REST)
 *   - `SupabaseProvider`   — hosted (pgvector via RPC)
 */
export interface VectorProvider {
  /** Stable identifier — e.g. "sqlite-vec", "pinecone", "supabase". */
  readonly name: string;

  listCollections(): Promise<CollectionInfo[]>;

  getCollection(opts: GetCollectionOptions): Promise<VectorCollection>;

  createCollection(opts: CreateCollectionOptions): Promise<VectorCollection>;

  getOrCreateCollection(
    opts: CreateCollectionOptions
  ): Promise<VectorCollection>;

  deleteCollection(name: string): Promise<void>;

  /** Release any underlying resources (db handles, http agents, …). */
  close(): Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CollectionNotFoundError extends Error {
  constructor(name: string) {
    super(`Vector collection '${name}' not found`);
    this.name = "CollectionNotFoundError";
  }
}

export class UnsupportedFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFilterError";
  }
}

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}
