---
layout: page
title: "Indexing & Vector Stores"
description: "Ingest documents for semantic search and RAG with NodeTool's vector indexing pipeline — SQLite-vec by default, with a Supabase/pgvector option."
---



NodeTool ships a lightweight ingestion pipeline for semantic search and retrieval-augmented generation (RAG) tasks. The indexing logic is split across `@nodetool-ai/vectorstore` (store, chunking, and embedding) and `@nodetool-ai/websocket` (the upload route).

## Overview

- **Collection metadata** (`CollectionResponse` in `@nodetool-ai/protocol` `packages/protocol/src/api-types.ts`) carries the collection's name, document count, free-form metadata, and `workflow_name` — the resolved name of the workflow id stored under `metadata.workflow`, shown in listings.
- **Vector store** -- the default backend is SQLite-vec (`@nodetool-ai/vectorstore` `packages/vectorstore/src/sqlite-vec-store.ts`). Embeddings flow through the `VectorProvider` abstraction — see [Vector Storage](vector-storage.md) for swapping backends (Supabase/pgvector, or the Pinecone stub).
- **Indexing route** -- `handleCollectionRequest()` (`@nodetool-ai/websocket` `packages/websocket/src/collection-api.ts`) handles the multipart upload and performs the ingestion itself. It is the one collection endpoint that stayed on REST; every other CRUD and query endpoint moved to the tRPC `collections` router.

### Default Flow

1. `handleCollectionRequest()` matches `POST /api/collections/:name/index`, resolves the collection through `getDefaultVectorProvider().getCollection()`, and checks ownership with `canAccessCollection()` — someone else's collection answers `404`, not `403`, so the endpoint cannot be used to probe for names.
2. The request must be `multipart/form-data` with a `file` field. Otherwise the route answers `400`, and `405` for a method other than `POST`. A file above `getMaxUploadBytes()` (`NODETOOL_MAX_UPLOAD_BYTES`, 1 GiB by default) answers `413`. The file is read as UTF-8 text, split with `splitDocument()` from `@nodetool-ai/vectorstore` (2000 characters per chunk, 1000 overlap), and upserted into the collection as `<file name>#<n>` chunks carrying `source` and `start_index` metadata. An empty or whitespace-only file produces zero chunks.
   The route reads text only, so it does not extract text from PDF, DOCX, or other binary formats. It also passes no embedding function when it opens the collection, so it stores chunk text without calling the collection's embedding model. To embed during ingestion, use the `vector.Index*` nodes below.
3. The route returns `{ path, chunks, error }`. A `CollectionNotFoundError` becomes `404`; any other provider error is logged and returned as a generic `500`, because provider errors carry SQL text, file paths, and upstream URLs.

## Indexing from a workflow

Index nodes write to a collection and query nodes read from it. Each takes a `collection` input (see the `vector.Collection` node, which gets or creates a collection by name and embedding model).

| Node | Purpose |
|---|---|
| `vector.IndexString` | Index a string under a document id. |
| `vector.IndexTextChunk` | Index a single text chunk. |
| `vector.IndexAggregatedText` | Index several text chunks at once with aggregated embeddings from Ollama. |
| `vector.IndexImage` | Index a list of image assets or files. |
| `vector.IndexEmbedding` | Index a single precomputed embedding vector, with optional metadata. |
| `vector.QueryText`, `vector.QueryImage` | Similarity search by text or image. |
| `vector.HybridSearch` | Fuses a semantic ranking with a keyword-filtered one by reciprocal rank fusion. |
| `vector.Count`, `vector.GetDocuments`, `vector.Peek` | Inspect a collection. |
| `vector.RemoveOverlap` | Removes overlapping words between consecutive strings in a list. |

Definitions are in `packages/core-nodes/src/nodes/vector.ts`. To index a PDF, extract its text first with a node such as `lib.pdf.ExtractText`.

## Configuring the vector store

The default backend is local SQLite-vec. Switch backends with `NODETOOL_VECTOR_PROVIDER`.

| Variable | Description | Default |
|----------|-------------|---------|
| `NODETOOL_VECTOR_PROVIDER` | `sqlite-vec`, `pinecone`, or `supabase` | `sqlite-vec` |
| `VECTORSTORE_DB_PATH` | Local SQLite-vec database file | `vectorstore.db` in the NodeTool data dir (`$XDG_DATA_HOME/nodetool`, falling back to `~/.local/share/nodetool`) |
| `PINECONE_API_KEY` | Required to select `pinecone`, which is a stub that fails on use | — |
| `SUPABASE_URL` and `SUPABASE_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) | Required when provider is `supabase`. Install the SQL migration once. | — |

See [Vector Storage](vector-storage.md) for backend-specific setup.

## CLI & API Integration

- `POST /api/collections/:name/index` (see `@nodetool-ai/websocket` `packages/websocket/src/collection-api.ts`) triggers ingestion via HTTP (multipart/form-data file upload).
- The MCP server (`@nodetool-ai/websocket` `packages/websocket/src/mcp-server.ts`) exposes the CodeAct action tool `execute_code` plus `view_image` and the direct set. An IDE plug-in reads collections from inside an action — `nodetool.collections.list()` and `nodetool.collections.query()`. It does **not** index assets.
- A deployed server exposes no separate admin ingestion endpoints. The `/admin/*` surface `@nodetool-ai/deploy`'s client used to carry was ported from the retired Python server and never mounted; use `POST /api/collections/:name/index` against the deployment instead.

## Troubleshooting

- **Supabase errors** – verify `SUPABASE_URL`, the key, and that `packages/vectorstore/sql/supabase-migration.sql` ran on the project. Fall back to local SQLite-vec by setting `NODETOOL_VECTOR_PROVIDER=sqlite-vec`.
- **Pinecone errors** – the provider is not implemented. Use `sqlite-vec` or `supabase`.
- **Large files** – ensure `VECTORSTORE_DB_PATH` has disk headroom, or move to a remote backend.

## Related Documentation

- [Providers](providers.md) – selecting embedding models for ingestion nodes.  
- [Workflow API](workflow-api.md) – details on `RunJobRequest`.  
- [Storage Guide](storage.md) – configuring persistent storage for uploaded documents.
