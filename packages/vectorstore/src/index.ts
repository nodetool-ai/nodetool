// @nodetool/vectorstore — SQLite-vec backed vector store

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
  type GetResult,
  type EmbeddingFunction
} from "./sqlite-vec-store.js";

export { splitDocument, type TextChunk } from "./chroma-client.js";

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

// ---------------------------------------------------------------------------
// Convenience helpers (API-compatible with old ChromaDB wrappers)
// ---------------------------------------------------------------------------

import { getDefaultStore, type EmbeddingFunction } from "./sqlite-vec-store.js";
import { getProviderEmbeddingFunction } from "./embedding.js";

/**
 * Get the default vector store client (replaces getChromaClient).
 */
export async function getVecStore() {
  return getDefaultStore();
}

/**
 * Get a collection by name with optional embedding function.
 */
export async function getCollection(
  name: string,
  embeddingFunction?: EmbeddingFunction | null
) {
  const store = getDefaultStore();
  return store.getCollection({
    name,
    embeddingFunction: embeddingFunction ?? undefined
  });
}

/**
 * Get all collections, automatically resolving embedding functions
 * from each collection's metadata.
 */
export async function getAllCollections() {
  const store = getDefaultStore();
  const collections = await store.listCollections();
  const result = [];

  for (const col of collections) {
    const metadata = col.metadata ?? {};
    const model = metadata.embedding_model as string | undefined;
    const provider = metadata.embedding_provider as string | undefined;

    let ef: EmbeddingFunction | undefined;
    if (model) {
      ef = getProviderEmbeddingFunction(model, provider) ?? undefined;
    }

    // Re-get with embedding function
    if (ef) {
      const withEf = await store.getCollection({
        name: col.name,
        embeddingFunction: ef
      });
      result.push(withEf);
    } else {
      result.push(col);
    }
  }

  return result;
}
