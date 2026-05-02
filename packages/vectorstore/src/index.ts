// @nodetool-ai/vectorstore — backend-agnostic vector store

// ---------------------------------------------------------------------------
// Backend-agnostic vector provider abstraction (preferred public API)
// ---------------------------------------------------------------------------

export {
  CollectionNotFoundError,
  ProviderConfigError,
  UnsupportedFilterError,
  type CollectionInfo as ProviderCollectionInfo,
  type CollectionMetadata as ProviderCollectionMetadata,
  type CreateCollectionOptions,
  type DistanceMetric,
  type GetCollectionOptions,
  type MetadataValue,
  type RecordMetadata,
  type VectorCollection,
  type VectorFilter,
  type VectorMatch,
  type VectorProvider,
  type VectorQuery,
  type VectorRecord
} from "./provider.js";

export {
  SqliteVecProvider,
  type SqliteVecProviderOptions
} from "./sqlite-vec-provider.js";

export {
  PineconeProvider,
  type PineconeProviderOptions
} from "./pinecone-provider.js";

export {
  SupabaseProvider,
  type SupabaseProviderOptions
} from "./supabase-provider.js";

export {
  createSqliteVecProvider,
  createVectorProviderFromEnv,
  getDefaultVectorProvider,
  resetDefaultVectorProvider,
  setDefaultVectorProvider,
  type VectorProviderKind
} from "./provider-factory.js";

// ---------------------------------------------------------------------------
// Embedding functions
// ---------------------------------------------------------------------------

export {
  ProviderEmbeddingFunction,
  OpenAIEmbeddingFunction,
  OllamaEmbeddingFunction,
  GeminiEmbeddingFunction,
  MistralEmbeddingFunction,
  CohereEmbeddingFunction,
  VoyageEmbeddingFunction,
  JinaEmbeddingFunction,
  getProviderEmbeddingFunction,
  type EmbeddingProvider,
  type ProviderEmbeddingOptions
} from "./embedding.js";

export { type EmbeddingFunction } from "./sqlite-vec-store.js";

export { splitDocument, type TextChunk } from "./chroma-client.js";

// ---------------------------------------------------------------------------
// Low-level sqlite-vec types — exported for tests and code that needs to
// reach the underlying SQLite handle. New code should use VectorProvider.
// ---------------------------------------------------------------------------

export {
  SqliteVecStore,
  VecCollection,
  VecNotFoundError,
  getDefaultStore,
  resetDefaultStore,
  type CollectionMetadata,
  type CollectionInfo,
  type DocumentRecord,
  type QueryResult,
  type GetResult
} from "./sqlite-vec-store.js";

// ---------------------------------------------------------------------------
// Convenience: resolve a collection through the default provider, attaching
// an embedding function inferred from the collection's metadata.
// ---------------------------------------------------------------------------

import { getDefaultVectorProvider } from "./provider-factory.js";
import { getProviderEmbeddingFunction } from "./embedding.js";
import {
  CollectionNotFoundError,
  type RecordMetadata,
  type VectorCollection
} from "./provider.js";
import type { EmbeddingFunction } from "./sqlite-vec-store.js";

/**
 * Resolve a collection by name through the default provider. If
 * `embeddingFunction` is omitted, one is inferred from the collection's
 * `embedding_model` / `embedding_provider` metadata. Use `getOrCreate` to
 * create the collection if it does not exist.
 */
export async function resolveCollection(
  name: string,
  opts: {
    embeddingFunction?: EmbeddingFunction;
    getOrCreate?: boolean;
    metadata?: RecordMetadata;
  } = {}
): Promise<VectorCollection> {
  const provider = getDefaultVectorProvider();

  let ef = opts.embeddingFunction;
  if (!ef) {
    try {
      const existing = await provider.getCollection({ name });
      const meta = existing.metadata ?? {};
      const model = meta.embedding_model as string | undefined;
      const efProvider = meta.embedding_provider as string | undefined;
      if (model) {
        ef = getProviderEmbeddingFunction(model, efProvider) ?? undefined;
      }
      if (ef) {
        return provider.getCollection({ name, embeddingFunction: ef });
      }
      return existing;
    } catch (e) {
      if (!(e instanceof CollectionNotFoundError) || !opts.getOrCreate) throw e;
    }
  }

  if (opts.getOrCreate) {
    return provider.getOrCreateCollection({
      name,
      embeddingFunction: ef,
      metadata: opts.metadata
    });
  }

  return provider.getCollection({ name, embeddingFunction: ef });
}
