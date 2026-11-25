/**
 * SQLite-backed vector store using sqlite-vec extension.
 *
 * Replaces ChromaDB with a zero-dependency embedded vector database.
 * Uses better-sqlite3 for the database driver and sqlite-vec for
 * vector similarity search.
 */

import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { createLogger, getDefaultVectorstoreDbPath } from "@nodetool-ai/config";

const log = createLogger("nodetool.vectorstore.sqlite-vec");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollectionMetadata {
  [key: string]: string | number | boolean | undefined;
}

export interface CollectionInfo {
  name: string;
  metadata: CollectionMetadata;
}

export interface DocumentRecord {
  id: string;
  document: string | null;
  embedding: number[] | null;
  uri: string | null;
  metadata: Record<string, string | number | boolean>;
}

export interface QueryResult {
  ids: string[][];
  documents: (string | null)[][];
  metadatas: (Record<string, unknown> | null)[][];
  uris: (string | null)[][];
  distances: number[][];
}

export interface GetResult {
  ids: string[];
  documents: (string | null)[];
  metadatas: (Record<string, unknown> | null)[];
  uris: (string | null)[];
}

/** Collection metadata key naming the record metadata key that partitions the index. */
export const PARTITION_KEY_METADATA_KEY = "partition_key";
/** Collection metadata key recording the vector dimension once known. */
export const DIMENSION_METADATA_KEY = "dimension";

function parseMetadata(raw: string | null): Record<string, unknown> {
  try {
    return JSON.parse(raw ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function emptyQueryResult(): QueryResult {
  return {
    ids: [[]],
    documents: [[]],
    metadatas: [[]],
    uris: [[]],
    distances: [[]]
  };
}

// ---------------------------------------------------------------------------
// Embedding function interface (standalone, no ChromaDB dependency)
// ---------------------------------------------------------------------------

export interface EmbeddingFunction {
  generate(texts: string[]): Promise<number[][]>;
}

// ---------------------------------------------------------------------------
// Collection handle
// ---------------------------------------------------------------------------

export class VecCollection {
  name: string;
  metadata: CollectionMetadata;
  private store: SqliteVecStore;
  private collectionId: number;
  private embeddingFunction: EmbeddingFunction | null;

  constructor(
    name: string,
    metadata: CollectionMetadata,
    store: SqliteVecStore,
    collectionId: number,
    embeddingFunction: EmbeddingFunction | null = null
  ) {
    this.name = name;
    this.metadata = metadata;
    this.store = store;
    this.collectionId = collectionId;
    this.embeddingFunction = embeddingFunction;
  }

  get db(): DatabaseType {
    return this.store.db;
  }

  private get docsTable(): string {
    return `vec_docs_${this.collectionId}`;
  }

  private get idxTable(): string {
    return `vec_idx_${this.collectionId}`;
  }

  /** The record metadata key whose value partitions the index, if any. */
  private get partitionKey(): string | null {
    const key = this.metadata[PARTITION_KEY_METADATA_KEY];
    return typeof key === "string" && key ? key : null;
  }

  /** The partition value of one record: its metadata value as text, or "". */
  private partitionOf(metadata: Record<string, unknown> | null | undefined): string {
    const key = this.partitionKey;
    const value = key ? metadata?.[key] : undefined;
    return value === undefined || value === null ? "" : String(value);
  }

  /** Get the vector dimension for this collection (recorded, else from the first stored doc, else 0). */
  private getDimension(): number {
    const recorded = this.metadata[DIMENSION_METADATA_KEY];
    if (typeof recorded === "number" && recorded > 0) return recorded;
    const row = this.db
      .prepare(
        `SELECT embedding FROM "${this.docsTable}" WHERE embedding IS NOT NULL LIMIT 1`
      )
      .get() as { embedding: Buffer } | undefined;
    if (!row) return 0;
    // Each float32 = 4 bytes
    return row.embedding.length / 4;
  }

  /** Ensure the vec0 virtual table exists with the right dimensions. */
  private ensureIndex(dimension: number): void {
    if (dimension <= 0) return;

    const exists = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(this.idxTable) as { name: string } | undefined;

    if (!exists) {
      // A partitioned index keeps one partition per value of the key, so a
      // query that names a partition scans only its vectors.
      const columns = this.partitionKey
        ? `partition text partition key, embedding float[${dimension}]`
        : `embedding float[${dimension}]`;
      this.db.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS "${this.idxTable}" USING vec0(${columns})`
      );

      // Backfill any existing docs that have embeddings but no vec_rowid
      const docs = this.db
        .prepare(
          `SELECT rowid, embedding, metadata FROM "${this.docsTable}" WHERE embedding IS NOT NULL AND vec_rowid IS NULL`
        )
        .all() as Array<{ rowid: number; embedding: Buffer; metadata: string }>;

      if (docs.length > 0) {
        const idxInsert = this.prepareIndexInsert();
        const updateVecRowid = this.db.prepare(
          `UPDATE "${this.docsTable}" SET vec_rowid = ? WHERE rowid = ?`
        );
        const tx = this.db.transaction(() => {
          for (const doc of docs) {
            const info = idxInsert(doc.embedding, parseMetadata(doc.metadata));
            updateVecRowid.run(info.lastInsertRowid, doc.rowid);
          }
        });
        tx();
      }
    }
    this.recordDimension(dimension);
  }

  /** An insert into the vec0 index that fills the partition column when there is one. */
  private prepareIndexInsert(): (
    embedding: Buffer,
    metadata: Record<string, unknown> | null | undefined
  ) => { lastInsertRowid: number | bigint } {
    if (this.partitionKey) {
      const statement = this.db.prepare(
        `INSERT INTO "${this.idxTable}"(partition, embedding) VALUES (?, ?)`
      );
      return (embedding, metadata) => statement.run(this.partitionOf(metadata), embedding);
    }
    const statement = this.db.prepare(`INSERT INTO "${this.idxTable}"(embedding) VALUES (?)`);
    return (embedding) => statement.run(embedding);
  }

  /** Write the dimension into the collection metadata the first time it is known. */
  private recordDimension(dimension: number): void {
    if (this.metadata[DIMENSION_METADATA_KEY] === dimension) return;
    this.metadata = { ...this.metadata, [DIMENSION_METADATA_KEY]: dimension };
    this.db
      .prepare(`UPDATE vec_collections SET metadata = ? WHERE id = ?`)
      .run(JSON.stringify(this.metadata), this.collectionId);
  }

  /** Serialize a float32 array to a Buffer for sqlite-vec. */
  private serializeEmbedding(embedding: number[]): Buffer {
    const buf = Buffer.alloc(embedding.length * 4);
    for (let i = 0; i < embedding.length; i++) {
      buf.writeFloatLE(embedding[i], i * 4);
    }
    return buf;
  }

  async count(): Promise<number> {
    const row = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM "${this.docsTable}"`)
      .get() as { cnt: number };
    return row.cnt;
  }

  async add(opts: {
    ids: string[];
    documents?: (string | null)[];
    embeddings?: number[][];
    uris?: (string | null)[];
    metadatas?: (Record<string, string | number | boolean> | null)[];
  }): Promise<void> {
    let embeddings = opts.embeddings;

    // Auto-embed documents if we have an embedding function and no embeddings provided
    if (!embeddings && opts.documents && this.embeddingFunction) {
      const textsToEmbed = opts.documents.map((d) => d ?? "");
      embeddings = await this.embeddingFunction.generate(textsToEmbed);
    }

    // Determine dimension from first embedding
    let dimension = 0;
    if (embeddings) {
      for (const emb of embeddings) {
        if (emb && emb.length > 0) {
          dimension = emb.length;
          break;
        }
      }
    }

    // Ensure vec0 index exists before inserting
    if (dimension > 0) {
      const existing = this.getDimension();
      if (existing > 0 && existing !== dimension) {
        throw new Error(
          `Collection '${this.name}' holds ${existing}-dimension vectors, got ${dimension}.`
        );
      }
      for (const emb of embeddings ?? []) {
        if (emb && emb.length > 0 && emb.length !== dimension) {
          throw new Error(
            `Embeddings in one call to '${this.name}' differ in dimension: ${dimension} and ${emb.length}.`
          );
        }
      }
      this.ensureIndex(dimension);
    }

    const insert = this.db.prepare(
      `INSERT INTO "${this.docsTable}" (doc_id, document, embedding, uri, metadata) VALUES (?, ?, ?, ?, ?)`
    );
    const idxInsert = dimension > 0 ? this.prepareIndexInsert() : null;
    const updateVecRowid =
      dimension > 0
        ? this.db.prepare(
            `UPDATE "${this.docsTable}" SET vec_rowid = ? WHERE rowid = ?`
          )
        : null;

    const tx = this.db.transaction(() => {
      for (let i = 0; i < opts.ids.length; i++) {
        const embBuf = embeddings?.[i]
          ? this.serializeEmbedding(embeddings[i])
          : null;

        const info = insert.run(
          opts.ids[i],
          opts.documents?.[i] ?? null,
          embBuf,
          opts.uris?.[i] ?? null,
          JSON.stringify(opts.metadatas?.[i] ?? {})
        );

        // Insert into vec0 index and record the mapping
        if (embBuf && idxInsert && updateVecRowid) {
          const idxInfo = idxInsert(embBuf, opts.metadatas?.[i]);
          updateVecRowid.run(idxInfo.lastInsertRowid, info.lastInsertRowid);
        }
      }
    });
    tx();
  }

  async upsert(opts: {
    ids: string[];
    documents?: (string | null)[];
    embeddings?: number[][];
    uris?: (string | null)[];
    metadatas?: (Record<string, string | number | boolean> | null)[];
  }): Promise<void> {
    // Delete existing then re-add
    await this.delete({ ids: opts.ids });
    await this.add(opts);
  }

  async get(opts?: {
    ids?: string[];
    limit?: number;
    offset?: number;
  }): Promise<GetResult> {
    let sql = `SELECT doc_id, document, uri, metadata FROM "${this.docsTable}"`;
    const params: unknown[] = [];

    if (opts?.ids && opts.ids.length > 0) {
      sql += ` WHERE doc_id IN (${opts.ids.map(() => "?").join(",")})`;
      params.push(...opts.ids);
    }

    sql += ` ORDER BY rowid`;

    if (opts?.limit) {
      sql += ` LIMIT ?`;
      params.push(opts.limit);
    }
    if (opts?.offset) {
      sql += ` OFFSET ?`;
      params.push(opts.offset);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      doc_id: string;
      document: string | null;
      uri: string | null;
      metadata: string;
    }>;

    return {
      ids: rows.map((r) => r.doc_id),
      documents: rows.map((r) => r.document),
      uris: rows.map((r) => r.uri ?? null),
      metadatas: rows.map((r) => {
        try {
          return JSON.parse(r.metadata ?? "{}");
        } catch {
          return {};
        }
      })
    };
  }

  async peek(opts?: { limit?: number }): Promise<GetResult> {
    return this.get({ limit: opts?.limit ?? 10 });
  }

  async delete(opts: { ids: string[] }): Promise<void> {
    if (opts.ids.length === 0) return;

    // Get vec_rowids first for index cleanup
    const placeholders = opts.ids.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT vec_rowid FROM "${this.docsTable}" WHERE doc_id IN (${placeholders}) AND vec_rowid IS NOT NULL`
      )
      .all(...opts.ids) as Array<{ vec_rowid: number }>;

    // Delete from vec0 index if it exists
    const idxExists = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(this.idxTable);
    if (idxExists && rows.length > 0) {
      const vecRowids = rows.map((r) => r.vec_rowid);
      const idxPlaceholders = vecRowids.map(() => "?").join(",");
      this.db
        .prepare(
          `DELETE FROM "${this.idxTable}" WHERE rowid IN (${idxPlaceholders})`
        )
        .run(...vecRowids);
    }

    // Delete from docs table
    this.db
      .prepare(
        `DELETE FROM "${this.docsTable}" WHERE doc_id IN (${placeholders})`
      )
      .run(...opts.ids);
  }

  async query(opts: {
    queryTexts?: string[];
    queryEmbeddings?: number[][];
    queryURIs?: string[];
    nResults?: number;
    whereDocument?: Record<string, unknown>;
    include?: string[];
    /** Only records whose partition key value is this. Needs a partitioned collection. */
    partition?: string;
  }): Promise<QueryResult> {
    if (opts.partition !== undefined && !this.partitionKey) {
      throw new Error(`Collection '${this.name}' has no partition key.`);
    }
    const nResults = opts.nResults ?? 10;
    let queryEmbeddings = opts.queryEmbeddings;

    // Generate embeddings for query texts
    if (!queryEmbeddings && opts.queryTexts && this.embeddingFunction) {
      queryEmbeddings = await this.embeddingFunction.generate(opts.queryTexts);
    }

    // If we still don't have embeddings, fall back to keyword search
    if (!queryEmbeddings && opts.queryTexts) {
      return this.keywordSearch(opts.queryTexts, nResults, opts.whereDocument);
    }

    // URI-based query — fall back to metadata search
    if (!queryEmbeddings && opts.queryURIs) {
      return this.uriSearch(opts.queryURIs, nResults);
    }

    if (!queryEmbeddings || queryEmbeddings.length === 0) {
      return emptyQueryResult();
    }

    const dimension = this.getDimension();
    if (dimension === 0) {
      // No embeddings stored, return empty
      return emptyQueryResult();
    }

    this.ensureIndex(dimension);

    const allIds: string[][] = [];
    const allDocs: (string | null)[][] = [];
    const allMetas: (Record<string, unknown> | null)[][] = [];
    const allUris: (string | null)[][] = [];
    const allDistances: number[][] = [];

    for (const queryEmb of queryEmbeddings) {
      const queryBuf = this.serializeEmbedding(queryEmb);

      // Apply whereDocument filter if specified
      let docFilter = "";
      const filterParams: unknown[] = [];
      if (opts.whereDocument) {
        const conditions = this.buildWhereDocumentConditions(
          opts.whereDocument
        );
        if (conditions.sql) {
          docFilter = conditions.sql;
          filterParams.push(...conditions.params);
        }
      }

      let sql: string;
      let params: unknown[];
      const partitionSql = opts.partition !== undefined ? "AND v.partition = ?" : "";
      const partitionParams = opts.partition !== undefined ? [opts.partition] : [];

      if (docFilter) {
        // Filter first, then rank by distance
        sql = `
          SELECT d.doc_id, d.document, d.uri, d.metadata, v.distance
          FROM "${this.idxTable}" v
          JOIN "${this.docsTable}" d ON d.vec_rowid = v.rowid
          WHERE v.embedding MATCH ? AND k = ? ${partitionSql}
            AND ${docFilter}
          ORDER BY v.distance
        `;
        params = [queryBuf, nResults * 3, ...partitionParams, ...filterParams]; // over-fetch then limit
      } else {
        sql = `
          SELECT d.doc_id, d.document, d.uri, d.metadata, v.distance
          FROM "${this.idxTable}" v
          JOIN "${this.docsTable}" d ON d.vec_rowid = v.rowid
          WHERE v.embedding MATCH ? AND k = ? ${partitionSql}
          ORDER BY v.distance
        `;
        params = [queryBuf, nResults, ...partitionParams];
      }

      const rows = this.db.prepare(sql).all(...params) as Array<{
        doc_id: string;
        document: string | null;
        uri: string | null;
        metadata: string;
        distance: number;
      }>;

      const limited = docFilter ? rows.slice(0, nResults) : rows;

      allIds.push(limited.map((r) => r.doc_id));
      allDocs.push(limited.map((r) => r.document));
      allUris.push(limited.map((r) => r.uri ?? null));
      allMetas.push(
        limited.map((r) => {
          try {
            return JSON.parse(r.metadata ?? "{}");
          } catch {
            return {};
          }
        })
      );
      allDistances.push(limited.map((r) => r.distance));
    }

    return {
      ids: allIds,
      documents: allDocs,
      metadatas: allMetas,
      uris: allUris,
      distances: allDistances
    };
  }

  /** Keyword-based search fallback when no embedding function is available. */
  private keywordSearch(
    queryTexts: string[],
    nResults: number,
    whereDocument?: Record<string, unknown>
  ): QueryResult {
    const allIds: string[][] = [];
    const allDocs: (string | null)[][] = [];
    const allMetas: (Record<string, unknown> | null)[][] = [];
    const allUris: (string | null)[][] = [];
    const allDistances: number[][] = [];

    for (const queryText of queryTexts) {
      let sql = `SELECT doc_id, document, uri, metadata FROM "${this.docsTable}" WHERE document LIKE ? ESCAPE '\\'`;
      const escapedQuery = queryText.replace(/[%_\\]/g, "\\$&");
      const params: unknown[] = [`%${escapedQuery}%`];

      if (whereDocument) {
        const conditions = this.buildWhereDocumentConditions(whereDocument);
        if (conditions.sql) {
          sql += ` AND ${conditions.sql}`;
          params.push(...conditions.params);
        }
      }

      sql += ` LIMIT ?`;
      params.push(nResults);

      const rows = this.db.prepare(sql).all(...params) as Array<{
        doc_id: string;
        document: string | null;
        uri: string | null;
        metadata: string;
      }>;

      allIds.push(rows.map((r) => r.doc_id));
      allDocs.push(rows.map((r) => r.document));
      allUris.push(rows.map((r) => r.uri ?? null));
      allMetas.push(
        rows.map((r) => {
          try {
            return JSON.parse(r.metadata ?? "{}");
          } catch {
            return {};
          }
        })
      );
      allDistances.push(rows.map(() => 0)); // no distance for keyword search
    }

    return {
      ids: allIds,
      documents: allDocs,
      metadatas: allMetas,
      uris: allUris,
      distances: allDistances
    };
  }

  /** URI-based search. */
  private uriSearch(queryURIs: string[], nResults: number): QueryResult {
    const allIds: string[][] = [];
    const allDocs: (string | null)[][] = [];
    const allMetas: (Record<string, unknown> | null)[][] = [];
    const allUris: (string | null)[][] = [];
    const allDistances: number[][] = [];

    for (const uri of queryURIs) {
      const escapedUri = uri.replace(/[%_\\]/g, "\\$&");
      const rows = this.db
        .prepare(
          `SELECT doc_id, document, uri, metadata FROM "${this.docsTable}" WHERE uri LIKE ? ESCAPE '\\' LIMIT ?`
        )
        .all(`%${escapedUri}%`, nResults) as Array<{
        doc_id: string;
        document: string | null;
        uri: string | null;
        metadata: string;
      }>;

      allIds.push(rows.map((r) => r.doc_id));
      allDocs.push(rows.map((r) => r.document));
      allUris.push(rows.map((r) => r.uri ?? null));
      allMetas.push(
        rows.map((r) => {
          try {
            return JSON.parse(r.metadata ?? "{}");
          } catch {
            return {};
          }
        })
      );
      allDistances.push(rows.map(() => 0));
    }

    return {
      ids: allIds,
      documents: allDocs,
      metadatas: allMetas,
      uris: allUris,
      distances: allDistances
    };
  }

  /** Build SQL conditions from ChromaDB-style whereDocument filter. */
  private buildWhereDocumentConditions(where: Record<string, unknown>) {
    const parts: string[] = [];
    const params: unknown[] = [];

    if ("$contains" in where) {
      parts.push(`document LIKE ?`);
      params.push(`%${where.$contains}%`);
    }

    if ("$or" in where && Array.isArray(where.$or)) {
      const orParts: string[] = [];
      for (const condition of where.$or) {
        if (
          condition &&
          typeof condition === "object" &&
          "$contains" in condition
        ) {
          orParts.push(`document LIKE ?`);
          params.push(`%${(condition as Record<string, unknown>).$contains}%`);
        }
      }
      if (orParts.length > 0) {
        parts.push(`(${orParts.join(" OR ")})`);
      }
    }

    return { sql: parts.join(" AND "), params };
  }

  async modify(opts: {
    name?: string;
    metadata?: CollectionMetadata;
  }): Promise<void> {
    if (opts.name !== undefined) {
      this.db
        .prepare(`UPDATE vec_collections SET name = ? WHERE id = ?`)
        .run(opts.name, this.collectionId);
      this.name = opts.name;
    }
    if (opts.metadata !== undefined) {
      this.db
        .prepare(`UPDATE vec_collections SET metadata = ? WHERE id = ?`)
        .run(JSON.stringify(opts.metadata), this.collectionId);
      this.metadata = { ...opts.metadata };
    }
  }
}

// ---------------------------------------------------------------------------
// Store (manages the database and collections)
// ---------------------------------------------------------------------------

let _defaultStore: SqliteVecStore | null = null;

export class SqliteVecStore {
  readonly db: DatabaseType;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? getDefaultVectorstoreDbPath();

    // Ensure parent directory exists
    mkdirSync(dirname(resolvedPath), { recursive: true });

    this.db = new Database(resolvedPath);
    // The library indexer writes from its own process (R1).
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("journal_mode = WAL");

    // Load sqlite-vec extension
    sqliteVec.load(this.db);

    // Create collections registry table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vec_collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        metadata TEXT NOT NULL DEFAULT '{}'
      )
    `);

    log.info(`Opened vector store at ${resolvedPath}`);
  }

  /** Ensure the document table for a collection exists. */
  private ensureDocsTable(collectionId: number): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "vec_docs_${collectionId}" (
        rowid INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id TEXT NOT NULL UNIQUE,
        document TEXT,
        embedding BLOB,
        uri TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        vec_rowid INTEGER
      )
    `);
  }

  async createCollection(opts: {
    name: string;
    metadata?: CollectionMetadata;
    embeddingFunction?: EmbeddingFunction | null;
  }): Promise<VecCollection> {
    const meta = JSON.stringify(opts.metadata ?? {});
    this.db
      .prepare(`INSERT INTO vec_collections (name, metadata) VALUES (?, ?)`)
      .run(opts.name, meta);

    const row = this.db
      .prepare(`SELECT id, metadata FROM vec_collections WHERE name = ?`)
      .get(opts.name) as { id: number; metadata: string };

    this.ensureDocsTable(row.id);

    return new VecCollection(
      opts.name,
      JSON.parse(row.metadata),
      this,
      row.id,
      opts.embeddingFunction ?? null
    );
  }

  async getCollection(opts: {
    name: string;
    embeddingFunction?: EmbeddingFunction | null;
  }): Promise<VecCollection> {
    const row = this.db
      .prepare(`SELECT id, metadata FROM vec_collections WHERE name = ?`)
      .get(opts.name) as { id: number; metadata: string } | undefined;

    if (!row) {
      throw new VecNotFoundError(`Collection '${opts.name}' not found`);
    }

    this.ensureDocsTable(row.id);

    return new VecCollection(
      opts.name,
      JSON.parse(row.metadata),
      this,
      row.id,
      opts.embeddingFunction ?? null
    );
  }

  async getOrCreateCollection(opts: {
    name: string;
    metadata?: CollectionMetadata;
    embeddingFunction?: EmbeddingFunction | null;
  }): Promise<VecCollection> {
    try {
      return await this.getCollection({
        name: opts.name,
        embeddingFunction: opts.embeddingFunction
      });
    } catch (e) {
      if (e instanceof VecNotFoundError) {
        return this.createCollection(opts);
      }
      throw e;
    }
  }

  async listCollections(): Promise<VecCollection[]> {
    const rows = this.db
      .prepare(`SELECT id, name, metadata FROM vec_collections ORDER BY name`)
      .all() as Array<{ id: number; name: string; metadata: string }>;

    return rows.map(
      (r) => new VecCollection(r.name, JSON.parse(r.metadata), this, r.id)
    );
  }

  async deleteCollection(opts: { name: string }): Promise<void> {
    const row = this.db
      .prepare(`SELECT id FROM vec_collections WHERE name = ?`)
      .get(opts.name) as { id: number } | undefined;

    if (!row) {
      throw new VecNotFoundError(`Collection '${opts.name}' not found`);
    }

    // Drop the docs and index tables
    this.db.exec(`DROP TABLE IF EXISTS "vec_idx_${row.id}"`);
    this.db.exec(`DROP TABLE IF EXISTS "vec_docs_${row.id}"`);

    // Remove from registry
    this.db.prepare(`DELETE FROM vec_collections WHERE id = ?`).run(row.id);
  }

  close(): void {
    this.db.close();
  }
}

// ---------------------------------------------------------------------------
// Error type (replaces ChromaNotFoundError)
// ---------------------------------------------------------------------------

export class VecNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VecNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Default store singleton
// ---------------------------------------------------------------------------

export function getDefaultStore(): SqliteVecStore {
  if (!_defaultStore) {
    _defaultStore = new SqliteVecStore();
  }
  return _defaultStore;
}

/** Reset the default store (for testing). */
export function resetDefaultStore(): void {
  if (_defaultStore) {
    _defaultStore.close();
    _defaultStore = null;
  }
}
