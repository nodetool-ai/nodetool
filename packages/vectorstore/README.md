# @nodetool-ai/vectorstore

SQLite-vec vector store for [NodeTool](https://nodetool.ai) — embeddings, collections, and semantic search for RAG.

A backend-agnostic vector provider abstraction with a local SQLite-vec implementation (plus Pinecone and Supabase providers), document chunking, and embedding functions for OpenAI, Ollama, Gemini, Mistral, Cohere, Voyage, and Jina.

## Install

```bash
npm install @nodetool-ai/vectorstore
```

## Exported symbols

| Symbol | Kind | Description |
|---|---|---|
| `VectorProvider`, `VectorCollection` | interface | Backend-agnostic vector store contract |
| `SqliteVecProvider` | class | Local SQLite-vec provider |
| `PineconeProvider` | class | Pinecone-backed provider |
| `SupabaseProvider` | class | Supabase (pgvector) provider |
| `createVectorProviderFromEnv`, `getDefaultVectorProvider`, `setDefaultVectorProvider` | function | Resolve / configure the default provider |
| `createSqliteVecProvider` | function | Construct a local provider directly |
| `resolveCollection` | function | Get a collection through the default provider, inferring its embedding function |
| `getProviderEmbeddingFunction` | function | Build an embedding function for a model / provider |
| `OpenAIEmbeddingFunction`, `OllamaEmbeddingFunction`, `GeminiEmbeddingFunction`, `MistralEmbeddingFunction`, `CohereEmbeddingFunction`, `VoyageEmbeddingFunction`, `JinaEmbeddingFunction` | class | Provider-specific embedding functions |
| `splitDocument` | function | Chunk a document into overlapping text segments |
| `SqliteVecStore`, `VecCollection`, `getDefaultStore` | class / function | Low-level SQLite-vec handle (prefer `VectorProvider`) |
| `VectorRecord`, `VectorMatch`, `VectorQuery`, `DistanceMetric`, `RecordMetadata` | type | Query and record value types |
| `CollectionNotFoundError`, `ProviderConfigError`, `UnsupportedFilterError` | class | Error types |

## Usage

```ts
import {
  getDefaultVectorProvider,
  getProviderEmbeddingFunction,
  splitDocument
} from "@nodetool-ai/vectorstore";

const provider = getDefaultVectorProvider();
const ef = getProviderEmbeddingFunction("text-embedding-3-small", "openai");

const collection = await provider.getOrCreateCollection({
  name: "docs",
  embeddingFunction: ef,
  metadata: { embedding_model: "text-embedding-3-small", embedding_provider: "openai" }
});

const chunks = splitDocument("...long document...", "doc-1", 1000, 200);
await collection.upsert(
  chunks.map((c, i) => ({ id: `doc-1:${i}`, document: c.text }))
);

const results = await collection.query({ text: "what is nodetool?", topK: 5 });
```

The default provider is chosen from the environment (`createVectorProviderFromEnv`), defaulting to local SQLite-vec at `VECTORSTORE_DB_PATH`. When a collection stores `embedding_model` / `embedding_provider` metadata, `resolveCollection` reattaches the right embedding function for you.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
