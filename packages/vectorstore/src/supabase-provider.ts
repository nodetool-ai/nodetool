/**
 * Supabase implementation of the VectorProvider interface, on top of
 * `@supabase/supabase-js`.
 *
 * Storage layout (must be installed once via `sql/supabase-migration.sql`):
 *
 *   - `nodetool_vec_collections(name PK, metadata jsonb, dimension int, metric text)`
 *   - `nodetool_vec_records(collection FK, id, document, embedding vector, uri, metadata jsonb)`
 *   - RPC `nodetool_vec_match(collection, query_embedding, match_count, metadata_filter, document_match)`
 *
 * PostgREST cannot use pgvector operators directly, so similarity search
 * goes through `client.rpc('nodetool_vec_match', ...)`. CRUD on the two
 * tables uses the standard query builder. This matches the pattern in
 * Supabase's own AI guides (https://supabase.com/docs/guides/ai).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
// Options
// ---------------------------------------------------------------------------

export interface SupabaseProviderOptions {
  /** Supabase project URL (e.g. https://xyz.supabase.co). */
  url?: string;
  /** Supabase API key. Use the service-role key for server-side use. */
  apiKey?: string;
  /** Postgres schema housing the registry and records tables. Defaults to "public". */
  schema?: string;
  /** Pre-built Supabase client. Used by tests; if set, url/apiKey are ignored. */
  client?: SupabaseClient;
  /** Default embedding function applied when records/queries are text-only. */
  defaultEmbeddingFunction?: EmbeddingFunction;
  /** Override registry table name. Defaults to "nodetool_vec_collections". */
  registryTable?: string;
  /** Override records table name. Defaults to "nodetool_vec_records". */
  recordsTable?: string;
  /** Override match RPC name. Defaults to "nodetool_vec_match". */
  matchRpc?: string;
}

// ---------------------------------------------------------------------------
// Filter translation
//
// PostgREST filter chains can't express the full VectorFilter contract
// (no $and across nested predicates, no document substring). For the
// `nodetool_vec_match` RPC we translate filters into TWO inputs:
//
//   p_metadata_filter : jsonb     applied via `metadata @> filter`
//   p_document_match  : text|null applied via `document ILIKE '%' || x || '%'`
//
// The metadata side therefore only supports flat equality on metadata
// fields and `$and` of equalities. Anything richer ($gt/$lt/$or/$ne/$in)
// throws UnsupportedFilterError loudly so callers know what's missing.
// ---------------------------------------------------------------------------

interface SplitFilter {
  metadata: Record<string, string | number | boolean | null>;
  documentMatch: string | null;
}

function splitFilter(filter: VectorFilter | undefined): SplitFilter {
  const out: SplitFilter = { metadata: {}, documentMatch: null };
  if (!filter) return out;

  for (const [key, val] of Object.entries(filter)) {
    if (key === "$document") {
      out.documentMatch = readDocumentContains(val);
      continue;
    }
    if (key === "$and") {
      if (!Array.isArray(val)) {
        throw new UnsupportedFilterError("$and requires an array");
      }
      for (const sub of val as VectorFilter[]) {
        const merged = splitFilter(sub);
        if (merged.documentMatch) {
          if (out.documentMatch && out.documentMatch !== merged.documentMatch) {
            throw new UnsupportedFilterError(
              "Multiple $document.$contains predicates are not supported"
            );
          }
          out.documentMatch = merged.documentMatch;
        }
        Object.assign(out.metadata, merged.metadata);
      }
      continue;
    }
    if (key === "$or") {
      throw new UnsupportedFilterError(
        "$or is not supported by SupabaseProvider — use one match per branch instead"
      );
    }

    if (val === null || ["string", "number", "boolean"].includes(typeof val)) {
      out.metadata[key] = val as string | number | boolean | null;
      continue;
    }
    if (typeof val === "object" && val !== null) {
      const obj = val as Record<string, unknown>;
      if ("$eq" in obj && Object.keys(obj).length === 1) {
        out.metadata[key] = coerceScalar(obj.$eq);
        continue;
      }
    }
    throw new UnsupportedFilterError(
      `SupabaseProvider supports only flat metadata equality and ` +
        `$document.$contains. Got '${key}: ${JSON.stringify(val)}'.`
    );
  }
  return out;
}

function readDocumentContains(val: unknown): string {
  if (!val || typeof val !== "object") {
    throw new UnsupportedFilterError("$document requires an object");
  }
  const obj = val as Record<string, unknown>;
  if (typeof obj.$contains === "string") return obj.$contains;
  throw new UnsupportedFilterError(
    "$document only supports { $contains: string } in SupabaseProvider"
  );
}

function coerceScalar(v: unknown): string | number | boolean | null {
  if (v === null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return v;
  }
  return String(v);
}

// ---------------------------------------------------------------------------
// pgvector encoding — pgvector's input format is the string '[1,2,3]'.
// ---------------------------------------------------------------------------

function encodePgVector(embedding: readonly number[]): string {
  if (embedding.length === 0) {
    throw new Error("Cannot encode empty embedding vector");
  }
  return `[${embedding.join(",")}]`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMetadata(raw: unknown): CollectionMetadata {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as CollectionMetadata;
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw as CollectionMetadata;
  return {};
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
// Collection state
// ---------------------------------------------------------------------------

interface CollectionState {
  name: string;
  metadata: CollectionMetadata;
  dimension: number | null;
  metric: "cosine" | "l2" | "ip";
}

// ---------------------------------------------------------------------------
// Collection adapter
// ---------------------------------------------------------------------------

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

  async count(): Promise<number> {
    const client = this.provider.getClient();
    const result = await client
      .from(this.provider.recordsTable)
      .select("*", { count: "exact", head: true })
      .eq("collection", this.state.name);
    if (result.error) {
      throw new Error(`Supabase: ${result.error.message}`);
    }
    return result.count ?? 0;
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
      if (sample?.embedding) {
        const dim = sample.embedding.length;
        await this.provider.setDimension(this.state.name, dim);
        this.state = { ...this.state, dimension: dim };
      }
    }

    const rows = records.map((r) => ({
      collection: this.state.name,
      id: r.id,
      document: r.document ?? null,
      // pgvector accepts the text form '[1,2,3]'; PostgREST forwards it as
      // a JSON string, Postgres casts on the column type.
      embedding: r.embedding ? encodePgVector(r.embedding) : null,
      uri: r.uri ?? null,
      metadata: r.metadata ?? {}
    }));

    const client = this.provider.getClient();
    const { error } = await client
      .from(this.provider.recordsTable)
      .upsert(rows, { onConflict: "collection,id" });
    if (error) {
      throw new Error(`Supabase: ${error.message}`);
    }
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const client = this.provider.getClient();
    const { error } = await client
      .from(this.provider.recordsTable)
      .delete()
      .eq("collection", this.state.name)
      .in("id", ids);
    if (error) {
      throw new Error(`Supabase: ${error.message}`);
    }
  }

  async get(opts?: {
    ids?: string[];
    limit?: number;
    offset?: number;
  }): Promise<VectorRecord[]> {
    const client = this.provider.getClient();
    let q = client
      .from(this.provider.recordsTable)
      .select("id, document, uri, metadata")
      .eq("collection", this.state.name)
      .order("id");
    if (opts?.ids && opts.ids.length > 0) {
      q = q.in("id", opts.ids);
    }
    if (opts?.limit !== undefined || opts?.offset !== undefined) {
      const from = opts?.offset ?? 0;
      const limit = opts?.limit ?? 1000;
      q = q.range(from, from + limit - 1);
    }
    const { data, error } = await q;
    if (error) {
      throw new Error(`Supabase: ${error.message}`);
    }
    return (data ?? []).map((r) => ({
      id: r.id as string,
      document: (r.document as string | null) ?? null,
      uri: (r.uri as string | null) ?? null,
      metadata: toRecordMetadata(r.metadata)
    }));
  }

  async query(query: VectorQuery): Promise<VectorMatch[]> {
    const split = splitFilter(query.filter);
    const topK = query.topK ?? 10;

    let queryEmbedding = query.embedding;
    if (!queryEmbedding && query.text && this.embeddingFunction) {
      const [emb] = await this.embeddingFunction.generate([query.text]);
      queryEmbedding = emb;
    }

    // Vector search via the RPC.
    if (queryEmbedding && queryEmbedding.length > 0) {
      const client = this.provider.getClient();
      const { data, error } = await client.rpc(this.provider.matchRpc, {
        p_collection: this.state.name,
        p_query_embedding: encodePgVector(queryEmbedding),
        p_match_count: topK,
        p_metadata_filter: split.metadata,
        p_document_match: split.documentMatch
      });
      if (error) {
        throw new Error(`Supabase: ${error.message}`);
      }
      return ((data ?? []) as MatchRow[]).map(rowToMatch);
    }

    // Keyword search on `document` (no embedding function available).
    if (query.text) {
      return this.keywordSearch(query.text, topK, split);
    }

    // URI substring search.
    if (query.uri) {
      return this.uriSearch(query.uri, topK, split);
    }

    return [];
  }

  private async keywordSearch(
    text: string,
    topK: number,
    split: SplitFilter
  ): Promise<VectorMatch[]> {
    const client = this.provider.getClient();
    let q = client
      .from(this.provider.recordsTable)
      .select("id, document, uri, metadata")
      .eq("collection", this.state.name)
      .ilike("document", `%${escapeLike(text)}%`)
      .limit(topK);
    if (Object.keys(split.metadata).length > 0) {
      q = q.contains("metadata", split.metadata);
    }
    if (split.documentMatch && split.documentMatch !== text) {
      q = q.ilike("document", `%${escapeLike(split.documentMatch)}%`);
    }
    const { data, error } = await q;
    if (error) {
      throw new Error(`Supabase: ${error.message}`);
    }
    return (data ?? []).map((r) => ({
      id: r.id as string,
      document: (r.document as string | null) ?? null,
      uri: (r.uri as string | null) ?? null,
      metadata: toRecordMetadata(r.metadata),
      distance: 0
    }));
  }

  private async uriSearch(
    uri: string,
    topK: number,
    split: SplitFilter
  ): Promise<VectorMatch[]> {
    const client = this.provider.getClient();
    let q = client
      .from(this.provider.recordsTable)
      .select("id, document, uri, metadata")
      .eq("collection", this.state.name)
      .ilike("uri", `%${escapeLike(uri)}%`)
      .limit(topK);
    if (Object.keys(split.metadata).length > 0) {
      q = q.contains("metadata", split.metadata);
    }
    if (split.documentMatch) {
      q = q.ilike("document", `%${escapeLike(split.documentMatch)}%`);
    }
    const { data, error } = await q;
    if (error) {
      throw new Error(`Supabase: ${error.message}`);
    }
    return (data ?? []).map((r) => ({
      id: r.id as string,
      document: (r.document as string | null) ?? null,
      uri: (r.uri as string | null) ?? null,
      metadata: toRecordMetadata(r.metadata),
      distance: 0
    }));
  }

  async modify(opts: {
    name?: string;
    metadata?: CollectionMetadata;
  }): Promise<void> {
    const client = this.provider.getClient();
    let next: CollectionState = { ...this.state };

    if (opts.name !== undefined && opts.name !== this.state.name) {
      // FK has ON UPDATE CASCADE so records follow.
      const { error } = await client
        .from(this.provider.registryTable)
        .update({ name: opts.name })
        .eq("name", this.state.name);
      if (error) {
        throw new Error(`Supabase: ${error.message}`);
      }
      next = { ...next, name: opts.name };
    }

    if (opts.metadata !== undefined) {
      const { error } = await client
        .from(this.provider.registryTable)
        .update({ metadata: opts.metadata })
        .eq("name", next.name);
      if (error) {
        throw new Error(`Supabase: ${error.message}`);
      }
      next = { ...next, metadata: { ...opts.metadata } };
    }

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

function escapeLike(s: string): string {
  return s.replace(/([%_\\])/g, "\\$1");
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class SupabaseProvider implements VectorProvider {
  readonly name = "supabase";
  readonly schema: string;
  readonly registryTable: string;
  readonly recordsTable: string;
  readonly matchRpc: string;
  private readonly url: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly defaultEf?: EmbeddingFunction;
  private client: SupabaseClient | null;

  constructor(opts: SupabaseProviderOptions = {}) {
    if (!opts.client && (!opts.url || !opts.apiKey)) {
      throw new ProviderConfigError(
        "SupabaseProvider requires `url` and `apiKey`, or a pre-built `client`"
      );
    }
    this.url = opts.url;
    this.apiKey = opts.apiKey;
    this.schema = opts.schema ?? "public";
    this.registryTable = opts.registryTable ?? "nodetool_vec_collections";
    this.recordsTable = opts.recordsTable ?? "nodetool_vec_records";
    this.matchRpc = opts.matchRpc ?? "nodetool_vec_match";
    this.defaultEf = opts.defaultEmbeddingFunction;
    this.client = opts.client ?? null;
  }

  /** Returns the underlying client, instantiating one on first use. */
  getClient(): SupabaseClient {
    if (!this.client) {
      // Use the default-schema client; per-query schema scoping happens at
      // the call site via `client.schema(this.schema)` if needed. Passing
      // `db.schema` to createClient narrows the generic to a literal string
      // type and breaks assignment, which doesn't add value for our use.
      this.client = createClient(this.url!, this.apiKey!, {
        auth: { persistSession: false }
      });
    }
    return this.client;
  }

  async listCollections(): Promise<CollectionInfo[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.registryTable)
      .select("name, metadata, dimension")
      .order("name");
    if (error) {
      throw new Error(`Supabase: ${error.message}`);
    }
    return (data ?? []).map((r) => ({
      name: r.name as string,
      metadata: parseMetadata(r.metadata),
      dimension: (r.dimension as number | null) ?? undefined
    }));
  }

  async getCollection(opts: GetCollectionOptions): Promise<VectorCollection> {
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
    const metric = (opts.metric ?? "cosine") as "cosine" | "l2" | "ip";
    const metadata = opts.metadata ?? {};
    const dimension = opts.dimension ?? null;

    const client = this.getClient();
    const { error } = await client.from(this.registryTable).insert({
      name: opts.name,
      metadata,
      dimension,
      metric
    });
    if (error) {
      throw new Error(`Supabase: ${error.message}`);
    }

    return new SupabaseCollectionAdapter(
      this,
      { name: opts.name, metadata, dimension, metric },
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
    const state = await this.fetchRegistry(name);
    if (!state) throw new CollectionNotFoundError(name);
    const client = this.getClient();
    // FK cascades records — just delete the registry row.
    const { error } = await client
      .from(this.registryTable)
      .delete()
      .eq("name", name);
    if (error) {
      throw new Error(`Supabase: ${error.message}`);
    }
  }

  close(): void {
    // supabase-js does not hold a persistent connection; nothing to close.
  }

  // ----- internal helpers -------------------------------------------------

  /** Update the dimension column on first embedding-bearing upsert. */
  async setDimension(name: string, dimension: number): Promise<void> {
    const client = this.getClient();
    const { error } = await client
      .from(this.registryTable)
      .update({ dimension })
      .eq("name", name)
      .is("dimension", null);
    if (error) {
      throw new Error(`Supabase: ${error.message}`);
    }
  }

  private async fetchRegistry(name: string): Promise<CollectionState | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.registryTable)
      .select("name, metadata, dimension, metric")
      .eq("name", name)
      .maybeSingle();
    if (error) {
      throw new Error(`Supabase: ${error.message}`);
    }
    if (!data) return null;
    return {
      name: data.name as string,
      metadata: parseMetadata(data.metadata),
      dimension: (data.dimension as number | null) ?? null,
      metric: ((data.metric as string | null) ?? "cosine") as
        | "cosine"
        | "l2"
        | "ip"
    };
  }
}
