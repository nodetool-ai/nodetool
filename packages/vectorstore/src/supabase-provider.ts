/**
 * Supabase / Postgres + pgvector implementation of the VectorProvider
 * interface.
 *
 * Storage model:
 *   - one registry table (default: `nodetool_vec_collections`) tracking
 *     collection name, backing table, dimension, metric, and metadata;
 *   - one Postgres table per collection (default prefix: `nodetool_vec_`)
 *     with columns (id text PK, document text, embedding vector(dim),
 *     uri text, metadata jsonb).
 *
 * The provider uses `postgres` (postgres.js) by default but accepts an
 * injectable `PgClient` so tests can stub the SQL layer without a live
 * database. The pgvector extension is required — `init()` runs
 * `CREATE EXTENSION IF NOT EXISTS vector;` once on first use.
 */

import {
  CollectionNotFoundError,
  ProviderConfigError,
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
import type { EmbeddingFunction } from "./sqlite-vec-store.js";

// ---------------------------------------------------------------------------
// PgClient — minimal SQL surface, injectable for tests
// ---------------------------------------------------------------------------

/**
 * Minimal Postgres client surface used by `SupabaseProvider`. The default
 * implementation wraps `postgres` (postgres.js); tests pass a stub.
 */
export interface PgClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[]
  ): Promise<T[]>;
  end(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface SupabaseProviderOptions {
  /** Postgres connection string (`postgresql://...`). */
  databaseUrl?: string;
  /** Schema housing the registry and collection tables. Defaults to "public". */
  schema?: string;
  /** Registry table name. Defaults to "nodetool_vec_collections". */
  registryTable?: string;
  /** Per-collection table name prefix. Defaults to "nodetool_vec_". */
  tablePrefix?: string;
  /** Pre-built SQL client (for tests / shared connection pools). */
  client?: PgClient;
  /** Default embedding function applied to text-only upserts/queries. */
  defaultEmbeddingFunction?: EmbeddingFunction;
}

// ---------------------------------------------------------------------------
// Identifiers — collection names are projected onto a table name. Postgres
// allows arbitrary identifiers under double quotes, but we restrict the
// alphabet to keep DDL injection-proof and to fit pg's 63-char identifier
// limit (with prefix room).
// ---------------------------------------------------------------------------

const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const MAX_NAME_LEN = 48;

function validateCollectionName(name: string): void {
  if (typeof name !== "string" || !name) {
    throw new ProviderConfigError("Collection name must be a non-empty string");
  }
  if (name.length > MAX_NAME_LEN || !NAME_RE.test(name)) {
    throw new ProviderConfigError(
      `Invalid collection name '${name}': must match ^[A-Za-z][A-Za-z0-9_-]{0,${
        MAX_NAME_LEN - 1
      }}$`
    );
  }
}

/** Map a validated collection name to a SQL-safe table name (no hyphens). */
function tableNameFor(prefix: string, name: string): string {
  return prefix + name.replace(/-/g, "_");
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function qualified(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}

// ---------------------------------------------------------------------------
// pgvector encoding — pg accepts `'[1,2,3]'::vector` as the literal form.
// ---------------------------------------------------------------------------

function encodePgVector(embedding: readonly number[]): string {
  if (embedding.length === 0) {
    throw new Error("Cannot encode empty embedding vector");
  }
  return `[${embedding.join(",")}]`;
}

// ---------------------------------------------------------------------------
// Filter translation: VectorFilter → SQL fragment + parameters
// ---------------------------------------------------------------------------

class ParamCollector {
  readonly values: unknown[] = [];
  push(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

const COMPARISON_OPS: Record<string, string> = {
  $gt: ">",
  $gte: ">=",
  $lt: "<",
  $lte: "<="
};

function translateFilter(
  filter: VectorFilter,
  params: ParamCollector
): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(filter)) {
    if (key === "$and" || key === "$or") {
      if (!Array.isArray(val)) {
        throw new UnsupportedFilterError(`${key} requires an array`);
      }
      const sub = (val as VectorFilter[])
        .map((f) => translateFilter(f, params))
        .filter((s) => s.length > 0);
      if (sub.length === 0) continue;
      const op = key === "$and" ? " AND " : " OR ";
      parts.push(`(${sub.map((s) => `(${s})`).join(op)})`);
      continue;
    }

    if (key === "$document") {
      parts.push(translateDocumentFilter(val, params));
      continue;
    }

    parts.push(translateFieldPredicate(key, val, params));
  }
  return parts.join(" AND ");
}

function translateDocumentFilter(
  val: unknown,
  params: ParamCollector
): string {
  if (!val || typeof val !== "object") {
    throw new UnsupportedFilterError("$document requires an object");
  }
  const obj = val as Record<string, unknown>;
  if (typeof obj.$contains === "string") {
    return `document ILIKE '%' || ${params.push(obj.$contains)} || '%'`;
  }
  if (Array.isArray(obj.$or)) {
    const subs = obj.$or.map((sub) => {
      if (
        sub &&
        typeof sub === "object" &&
        typeof (sub as { $contains?: unknown }).$contains === "string"
      ) {
        return `document ILIKE '%' || ${params.push(
          (sub as { $contains: string }).$contains
        )} || '%'`;
      }
      throw new UnsupportedFilterError(
        "$document.$or members must be { $contains: string }"
      );
    });
    return `(${subs.join(" OR ")})`;
  }
  throw new UnsupportedFilterError(
    "$document supports only { $contains } or { $or: [{$contains}, ...] }"
  );
}

function translateFieldPredicate(
  field: string,
  val: unknown,
  params: ParamCollector
): string {
  const path = `metadata->>${params.push(field)}`;

  if (val === null) {
    return `${path} IS NULL`;
  }

  if (typeof val !== "object" || Array.isArray(val)) {
    return `${path} = ${params.push(String(val))}`;
  }

  const ops = val as Record<string, unknown>;
  const fragments: string[] = [];
  for (const [op, opVal] of Object.entries(ops)) {
    switch (op) {
      case "$eq":
        fragments.push(`${path} = ${params.push(String(opVal))}`);
        break;
      case "$ne":
        fragments.push(`${path} <> ${params.push(String(opVal))}`);
        break;
      case "$gt":
      case "$gte":
      case "$lt":
      case "$lte":
        fragments.push(
          `(${path})::numeric ${COMPARISON_OPS[op]} ${params.push(opVal)}`
        );
        break;
      case "$in": {
        if (!Array.isArray(opVal)) {
          throw new UnsupportedFilterError("$in requires an array");
        }
        fragments.push(
          `${path} = ANY(${params.push(opVal.map((x) => String(x)))})`
        );
        break;
      }
      default:
        throw new UnsupportedFilterError(`Unsupported operator: ${op}`);
    }
  }
  return fragments.join(" AND ");
}

// ---------------------------------------------------------------------------
// Registry row shape
// ---------------------------------------------------------------------------

interface RegistryRow {
  name: string;
  table_name: string;
  metadata: CollectionMetadata | string | null;
  dimension: number | null;
  metric: string | null;
}

function parseMetadata(
  raw: CollectionMetadata | string | null | undefined
): CollectionMetadata {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as CollectionMetadata;
    } catch {
      return {};
    }
  }
  return raw;
}

function toRecordMetadata(raw: unknown): RecordMetadata {
  if (!raw || typeof raw !== "object") return {};
  const out: RecordMetadata = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
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

interface CollectionState {
  name: string;
  tableName: string;
  metadata: CollectionMetadata;
  dimension: number | null;
  metric: string;
}

class SupabaseCollectionAdapter implements VectorCollection {
  constructor(
    private readonly provider: SupabaseProvider,
    private state: CollectionState,
    private readonly embeddingFunction: EmbeddingFunction | null
  ) {}

  get name(): string {
    return this.state.name;
  }

  get metadata(): CollectionMetadata {
    return this.state.metadata;
  }

  private get tableSql(): string {
    return qualified(this.provider.schema, this.state.tableName);
  }

  async count(): Promise<number> {
    const client = await this.provider.getClient();
    const rows = await client.query<{ count: string | number }>(
      `SELECT count(*)::int AS count FROM ${this.tableSql}`
    );
    return Number(rows[0]?.count ?? 0);
  }

  async upsert(input: VectorRecord[]): Promise<void> {
    if (input.length === 0) return;

    let records = input;
    let withEmbeddings = 0;
    for (const r of records) {
      if (r.embedding && r.embedding.length > 0) withEmbeddings++;
    }

    const ef = this.embeddingFunction;
    if (withEmbeddings === 0 && ef) {
      const texts = records.map((r) => r.document ?? "");
      const generated = await ef.generate(texts);
      records = records.map((r, i) => ({ ...r, embedding: generated[i] }));
      withEmbeddings = records.length;
    }

    if (withEmbeddings > 0 && withEmbeddings < records.length && !ef) {
      throw new Error(
        "SupabaseProvider.upsert requires every record to provide an " +
          "embedding when no embedding function is configured."
      );
    }

    // Pin dimension on first embedding-bearing upsert.
    if (withEmbeddings > 0 && this.state.dimension === null) {
      const sample = records.find(
        (r) => r.embedding && r.embedding.length > 0
      );
      if (sample && sample.embedding) {
        const dim = sample.embedding.length;
        await this.provider.setDimension(this.state.name, dim);
        this.state = { ...this.state, dimension: dim };
      }
    }

    const client = await this.provider.getClient();

    // Build (placeholder, value) pairs in SQL column order so the resulting
    // `params` array reads top-to-bottom as (id, document, embedding, uri,
    // metadata) per row — both for clarity and so tests can index params
    // positionally.
    const params: unknown[] = [];
    const valuesSql: string[] = [];
    for (const r of records) {
      const idPh = pushParam(params, r.id);
      const docPh = pushParam(params, r.document ?? null);
      const embPh = r.embedding
        ? `${pushParam(params, encodePgVector(r.embedding))}::vector`
        : "NULL";
      const uriPh = pushParam(params, r.uri ?? null);
      const metaPh = pushParam(
        params,
        JSON.stringify(r.metadata ?? {})
      );
      valuesSql.push(`(${idPh}, ${docPh}, ${embPh}, ${uriPh}, ${metaPh}::jsonb)`);
    }

    const sql = `
      INSERT INTO ${this.tableSql} (id, document, embedding, uri, metadata)
      VALUES ${valuesSql.join(", ")}
      ON CONFLICT (id) DO UPDATE SET
        document = EXCLUDED.document,
        embedding = EXCLUDED.embedding,
        uri = EXCLUDED.uri,
        metadata = EXCLUDED.metadata
    `;
    await client.query(sql, params);
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const client = await this.provider.getClient();
    await client.query(`DELETE FROM ${this.tableSql} WHERE id = ANY($1)`, [
      ids
    ]);
  }

  async get(opts?: {
    ids?: string[];
    limit?: number;
    offset?: number;
  }): Promise<VectorRecord[]> {
    const client = await this.provider.getClient();
    const params: unknown[] = [];
    let where = "";
    if (opts?.ids && opts.ids.length > 0) {
      where = `WHERE id = ANY(${pushParam(params, opts.ids)})`;
    }
    let limitSql = "";
    if (opts?.limit !== undefined) {
      limitSql += ` LIMIT ${pushParam(params, opts.limit)}`;
    }
    if (opts?.offset !== undefined) {
      limitSql += ` OFFSET ${pushParam(params, opts.offset)}`;
    }
    const rows = await client.query<{
      id: string;
      document: string | null;
      uri: string | null;
      metadata: unknown;
    }>(
      `SELECT id, document, uri, metadata FROM ${this.tableSql} ${where} ORDER BY id ${limitSql}`,
      params
    );
    return rows.map((r) => ({
      id: r.id,
      document: r.document,
      uri: r.uri,
      metadata: toRecordMetadata(r.metadata)
    }));
  }

  async query(query: VectorQuery): Promise<VectorMatch[]> {
    const client = await this.provider.getClient();
    const topK = query.topK ?? 10;

    const params: unknown[] = [];
    const collector = new ParamCollector();
    // We share `params` by re-using collector's behaviour explicitly:
    // ParamCollector pushes into its own array, so we'll merge afterwards.
    const filterSql = query.filter
      ? translateFilter(query.filter, collector)
      : "";

    // Determine query mode.
    let queryEmbedding = query.embedding;
    if (!queryEmbedding && query.text && this.embeddingFunction) {
      const [emb] = await this.embeddingFunction.generate([query.text]);
      queryEmbedding = emb;
    }

    // Path 1: vector search.
    if (queryEmbedding && queryEmbedding.length > 0) {
      const embParam = pushParam(params, encodePgVector(queryEmbedding));
      // Append filter params after vector params to keep $N order in the
      // final SQL string.
      const filterParamOffset = params.length;
      const filterSqlAdjusted = filterSql.replace(
        /\$(\d+)/g,
        (_, n) => `$${Number(n) + filterParamOffset}`
      );
      params.push(...collector.values);
      const limitParam = pushParam(params, topK);
      const operator = pickDistanceOperator(this.state.metric);
      const where = filterSqlAdjusted ? `WHERE ${filterSqlAdjusted}` : "";
      const sql = `
        SELECT id, document, uri, metadata,
               embedding ${operator} ${embParam}::vector AS distance
        FROM ${this.tableSql}
        ${where}
        ORDER BY embedding ${operator} ${embParam}::vector
        LIMIT ${limitParam}
      `;
      const rows = await client.query<MatchRow>(sql, params);
      return rows.map(rowToMatch);
    }

    // Path 2: text-only without embedding function — keyword search.
    if (query.text) {
      const textParam = pushParam(params, query.text);
      const filterParamOffset = params.length;
      const filterSqlAdjusted = filterSql.replace(
        /\$(\d+)/g,
        (_, n) => `$${Number(n) + filterParamOffset}`
      );
      params.push(...collector.values);
      const limitParam = pushParam(params, topK);
      const where = filterSqlAdjusted
        ? `AND ${filterSqlAdjusted}`
        : "";
      const sql = `
        SELECT id, document, uri, metadata, 0::float8 AS distance
        FROM ${this.tableSql}
        WHERE document ILIKE '%' || ${textParam} || '%'
        ${where}
        ORDER BY id
        LIMIT ${limitParam}
      `;
      const rows = await client.query<MatchRow>(sql, params);
      return rows.map(rowToMatch);
    }

    // Path 3: URI substring search.
    if (query.uri) {
      const uriParam = pushParam(params, query.uri);
      const filterParamOffset = params.length;
      const filterSqlAdjusted = filterSql.replace(
        /\$(\d+)/g,
        (_, n) => `$${Number(n) + filterParamOffset}`
      );
      params.push(...collector.values);
      const limitParam = pushParam(params, topK);
      const where = filterSqlAdjusted ? `AND ${filterSqlAdjusted}` : "";
      const sql = `
        SELECT id, document, uri, metadata, 0::float8 AS distance
        FROM ${this.tableSql}
        WHERE uri ILIKE '%' || ${uriParam} || '%'
        ${where}
        ORDER BY id
        LIMIT ${limitParam}
      `;
      const rows = await client.query<MatchRow>(sql, params);
      return rows.map(rowToMatch);
    }

    return [];
  }

  async modify(opts: {
    name?: string;
    metadata?: CollectionMetadata;
  }): Promise<void> {
    const next = await this.provider.modifyCollection(this.state, opts);
    this.state = next;
  }
}

interface MatchRow {
  id: string;
  document: string | null;
  uri: string | null;
  metadata: unknown;
  distance: number | string;
}

function rowToMatch(r: MatchRow): VectorMatch {
  return {
    id: r.id,
    document: r.document,
    uri: r.uri,
    metadata: toRecordMetadata(r.metadata),
    distance: typeof r.distance === "string" ? Number(r.distance) : r.distance
  };
}

function pushParam(params: unknown[], v: unknown): string {
  params.push(v);
  return `$${params.length}`;
}

function pickDistanceOperator(metric: string): string {
  switch (metric) {
    case "l2":
      return "<->";
    case "ip":
      return "<#>";
    case "cosine":
    default:
      return "<=>";
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class SupabaseProvider implements VectorProvider {
  readonly name = "supabase";
  readonly schema: string;
  readonly registryTable: string;
  readonly tablePrefix: string;
  private readonly databaseUrl?: string;
  private readonly defaultEf?: EmbeddingFunction;
  private clientPromise: Promise<PgClient> | null;
  private initPromise: Promise<void> | null = null;
  private readonly ownsClient: boolean;

  constructor(opts: SupabaseProviderOptions = {}) {
    if (!opts.client && !opts.databaseUrl) {
      throw new ProviderConfigError(
        "SupabaseProvider requires either databaseUrl or a pre-built client"
      );
    }
    this.schema = opts.schema ?? "public";
    this.registryTable = opts.registryTable ?? "nodetool_vec_collections";
    this.tablePrefix = opts.tablePrefix ?? "nodetool_vec_";
    this.databaseUrl = opts.databaseUrl;
    this.defaultEf = opts.defaultEmbeddingFunction;
    this.ownsClient = !opts.client;
    this.clientPromise = opts.client ? Promise.resolve(opts.client) : null;
  }

  async getClient(): Promise<PgClient> {
    if (!this.clientPromise) {
      this.clientPromise = createDefaultPgClient(this.databaseUrl!);
    }
    const client = await this.clientPromise;
    if (!this.initPromise) {
      this.initPromise = this.init(client);
    }
    await this.initPromise;
    return client;
  }

  private async init(client: PgClient): Promise<void> {
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${qualified(this.schema, this.registryTable)} (
         name        text PRIMARY KEY,
         table_name  text NOT NULL,
         metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
         dimension   int,
         metric      text NOT NULL DEFAULT 'cosine',
         created_at  timestamptz NOT NULL DEFAULT now()
       )`
    );
  }

  async listCollections(): Promise<CollectionInfo[]> {
    const client = await this.getClient();
    const rows = await client.query<RegistryRow>(
      `SELECT name, table_name, metadata, dimension, metric
       FROM ${qualified(this.schema, this.registryTable)}
       ORDER BY name`
    );
    return rows.map((r) => ({
      name: r.name,
      metadata: parseMetadata(r.metadata),
      dimension: r.dimension ?? undefined
    }));
  }

  async getCollection(opts: GetCollectionOptions): Promise<VectorCollection> {
    validateCollectionName(opts.name);
    const state = await this.fetchRegistry(opts.name);
    if (!state) throw new CollectionNotFoundError(opts.name);
    return new SupabaseCollectionAdapter(
      this,
      state,
      opts.embeddingFunction ?? this.defaultEf ?? null
    );
  }

  async createCollection(
    opts: CreateCollectionOptions
  ): Promise<VectorCollection> {
    validateCollectionName(opts.name);
    const tableName = tableNameFor(this.tablePrefix, opts.name);
    const metric = opts.metric ?? "cosine";
    const metadata = opts.metadata ?? {};

    const client = await this.getClient();
    await client.query(
      `INSERT INTO ${qualified(this.schema, this.registryTable)}
         (name, table_name, metadata, dimension, metric)
       VALUES ($1, $2, $3::jsonb, $4, $5)`,
      [
        opts.name,
        tableName,
        JSON.stringify(metadata),
        opts.dimension ?? null,
        metric
      ]
    );

    await this.createCollectionTable(tableName, opts.dimension ?? null);

    const state: CollectionState = {
      name: opts.name,
      tableName,
      metadata,
      dimension: opts.dimension ?? null,
      metric
    };

    return new SupabaseCollectionAdapter(
      this,
      state,
      opts.embeddingFunction ?? this.defaultEf ?? null
    );
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
    validateCollectionName(name);
    const state = await this.fetchRegistry(name);
    if (!state) throw new CollectionNotFoundError(name);

    const client = await this.getClient();
    await client.query(
      `DROP TABLE IF EXISTS ${qualified(this.schema, state.tableName)}`
    );
    await client.query(
      `DELETE FROM ${qualified(this.schema, this.registryTable)} WHERE name = $1`,
      [name]
    );
  }

  async close(): Promise<void> {
    if (!this.ownsClient || !this.clientPromise) return;
    try {
      const c = await this.clientPromise;
      await c.end();
    } catch {
      // ignore
    } finally {
      this.clientPromise = null;
      this.initPromise = null;
    }
  }

  // ----- internal helpers -------------------------------------------------

  async setDimension(name: string, dimension: number): Promise<void> {
    const client = await this.getClient();
    await client.query(
      `UPDATE ${qualified(this.schema, this.registryTable)}
       SET dimension = $1 WHERE name = $2 AND dimension IS NULL`,
      [dimension, name]
    );
    const state = await this.fetchRegistry(name);
    if (state) {
      await this.alterEmbeddingDimension(state.tableName, dimension);
    }
  }

  async modifyCollection(
    state: CollectionState,
    opts: { name?: string; metadata?: CollectionMetadata }
  ): Promise<CollectionState> {
    const client = await this.getClient();
    let next: CollectionState = { ...state };

    if (opts.name !== undefined && opts.name !== state.name) {
      validateCollectionName(opts.name);
      const newTable = tableNameFor(this.tablePrefix, opts.name);
      await client.query(
        `ALTER TABLE ${qualified(
          this.schema,
          state.tableName
        )} RENAME TO ${quoteIdent(newTable)}`
      );
      await client.query(
        `UPDATE ${qualified(this.schema, this.registryTable)}
         SET name = $1, table_name = $2 WHERE name = $3`,
        [opts.name, newTable, state.name]
      );
      next = { ...next, name: opts.name, tableName: newTable };
    }

    if (opts.metadata !== undefined) {
      await client.query(
        `UPDATE ${qualified(this.schema, this.registryTable)}
         SET metadata = $1::jsonb WHERE name = $2`,
        [JSON.stringify(opts.metadata), next.name]
      );
      next = { ...next, metadata: { ...opts.metadata } };
    }

    return next;
  }

  private async fetchRegistry(name: string): Promise<CollectionState | null> {
    const client = await this.getClient();
    const rows = await client.query<RegistryRow>(
      `SELECT name, table_name, metadata, dimension, metric
       FROM ${qualified(this.schema, this.registryTable)}
       WHERE name = $1`,
      [name]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      name: row.name,
      tableName: row.table_name,
      metadata: parseMetadata(row.metadata),
      dimension: row.dimension ?? null,
      metric: row.metric ?? "cosine"
    };
  }

  private async createCollectionTable(
    tableName: string,
    dimension: number | null
  ): Promise<void> {
    const client = await this.getClient();
    const embeddingType = dimension ? `vector(${dimension})` : "vector";
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${qualified(this.schema, tableName)} (
         id        text PRIMARY KEY,
         document  text,
         embedding ${embeddingType},
         uri       text,
         metadata  jsonb NOT NULL DEFAULT '{}'::jsonb
       )`
    );
  }

  private async alterEmbeddingDimension(
    tableName: string,
    dimension: number
  ): Promise<void> {
    const client = await this.getClient();
    // Tighten an unsized `vector` column to `vector(<dim>)` once we know the
    // dimension. Safe to run repeatedly: `USING embedding::vector(<dim>)`.
    await client.query(
      `ALTER TABLE ${qualified(
        this.schema,
        tableName
      )} ALTER COLUMN embedding TYPE vector(${dimension}) USING embedding::vector(${dimension})`
    );
  }
}

// ---------------------------------------------------------------------------
// Default postgres.js-backed PgClient
// ---------------------------------------------------------------------------

async function createDefaultPgClient(databaseUrl: string): Promise<PgClient> {
  const { default: postgres } = (await import("postgres")) as {
    default: (
      url: string,
      opts?: Record<string, unknown>
    ) => {
      unsafe: <T>(q: string, p?: readonly unknown[]) => Promise<T[]>;
      end: (opts?: { timeout?: number }) => Promise<void>;
    };
  };
  const sql = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10
  });
  return {
    query: (q, params = []) => sql.unsafe(q, params),
    end: () => sql.end({ timeout: 5 })
  };
}
