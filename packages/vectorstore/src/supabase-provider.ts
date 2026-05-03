/**
 * Supabase (pgvector) implementation of the VectorProvider interface.
 *
 * Stub: only the constructor / config validation is wired up. The intended
 * shape uses Supabase RPC functions backed by pgvector — typically a
 * `match_documents(query_embedding vector, match_count int, filter jsonb)`
 * function plus a `documents` table per collection.
 */

import {
  ProviderConfigError,
  type CollectionInfo,
  type CreateCollectionOptions,
  type GetCollectionOptions,
  type VectorCollection,
  type VectorProvider
} from "./provider.js";

export interface SupabaseProviderOptions {
  url: string;
  serviceRoleKey: string;
  /** Schema housing the vector tables. Defaults to "public". */
  schema?: string;
  /**
   * Name of the RPC used for nearest-neighbour search. Conventionally
   * `match_<collection>`, parameterised over collection name.
   */
  matchRpc?: (collection: string) => string;
}

export class SupabaseProvider implements VectorProvider {
  readonly name = "supabase";

  readonly url: string;
  readonly serviceRoleKey: string;
  readonly schema: string;
  readonly matchRpc: (collection: string) => string;

  constructor(opts: SupabaseProviderOptions) {
    if (!opts.url || !opts.serviceRoleKey) {
      throw new ProviderConfigError(
        "SupabaseProvider requires url and serviceRoleKey"
      );
    }
    this.url = opts.url;
    this.serviceRoleKey = opts.serviceRoleKey;
    this.schema = opts.schema ?? "public";
    this.matchRpc = opts.matchRpc ?? ((c) => `match_${c}`);
  }

  listCollections(): Promise<CollectionInfo[]> {
    // SELECT table_name FROM information_schema.tables
    //   WHERE table_schema = $schema AND table_name LIKE 'vec_%'
    throw notImplemented();
  }

  getCollection(_opts: GetCollectionOptions): Promise<VectorCollection> {
    throw notImplemented();
  }

  createCollection(_opts: CreateCollectionOptions): Promise<VectorCollection> {
    // CREATE TABLE vec_<name> (id text primary key, document text,
    //   embedding vector(<dim>), metadata jsonb);
    // CREATE INDEX ON vec_<name> USING ivfflat (embedding vector_cosine_ops);
    // dimension is REQUIRED by pgvector.
    throw notImplemented();
  }

  getOrCreateCollection(
    _opts: CreateCollectionOptions
  ): Promise<VectorCollection> {
    throw notImplemented();
  }

  deleteCollection(_name: string): Promise<void> {
    // DROP TABLE vec_<name>
    throw notImplemented();
  }

  close(): void {
    // No persistent connection (REST/postgrest based).
  }
}

function notImplemented(): Error {
  return new Error(
    "SupabaseProvider is not yet implemented — install @supabase/supabase-js and wire up the RPCs."
  );
}
