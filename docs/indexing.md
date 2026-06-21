---
layout: page
title: "Indexing & Vector Stores"
description: "Ingest documents for semantic search and RAG with NodeTool's vector indexing pipeline — SQLite-vec by default, with pgvector and Pinecone options."
---



NodeTool ships a lightweight ingestion pipeline for semantic search and retrieval-augmented generation (RAG) tasks. The indexing logic is split across `@nodetool-ai/vectorstore` (store and embedding) and `@nodetool-ai/deploy` (collection routes).

## Overview

- **Collection metadata** (`CollectionResponse` in `@nodetool-ai/protocol` `packages/protocol/src/api-types.ts`) stores ingest configuration, including an optional workflow ID.
- **Vector store** -- the default backend is SQLite-vec (`@nodetool-ai/vectorstore` `packages/vectorstore/src/sqlite-vec-store.ts`). Embeddings flow through the `VectorProvider` abstraction — see [Vector Storage](vector-storage.md) for swapping backends (Pinecone, Supabase/pgvector).
- **Indexing route** -- `handleCollectionIndex()` (`@nodetool-ai/deploy` `packages/deploy/src/collection-routes.ts`) validates the upload and delegates the actual ingestion to a caller-supplied `indexFn` callback (typed `IndexFileToCollectionFn`). The route itself does not resolve collections or run workflows; that logic lives in the provided callback.

### Default Flow

1. The HTTP layer receives an uploaded file and calls `handleCollectionIndex()` with the collection name, file path, MIME type, and an `indexFn`.
2. The `indexFn` callback performs the ingestion: it resolves the target collection (e.g. via `resolveCollection()` in `@nodetool-ai/vectorstore` `packages/vectorstore/src/index.ts`), splits the document with `splitDocument()`, embeds it, and stores embeddings in SQLite-vec.
3. `handleCollectionIndex()` returns an `IndexResult` (`{ path, error }`) per file, or throws a `CollectionHttpError` on failure.

### Messages & Progress

While custom workflows run, the service streams `JobUpdate`, `NodeUpdate`, and progress messages (from `@nodetool-ai/protocol` `packages/protocol/src/messages.ts`). Tests under `packages/deploy/tests/collection-routes.test.ts` cover expected message sequences.

## Configuring the vector store

The default backend is local SQLite-vec. Switch backends with `NODETOOL_VECTOR_PROVIDER`.

| Variable | Description | Default |
|----------|-------------|---------|
| `NODETOOL_VECTOR_PROVIDER` | `sqlite-vec`, `pinecone`, or `supabase` | `sqlite-vec` |
| `VECTORSTORE_DB_PATH` | Local SQLite-vec database file | `~/.local/share/nodetool/vectorstore.db` |
| `PINECONE_API_KEY` | Required when provider is `pinecone` | — |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Required when provider is `supabase` | — |

See [Vector Storage](vector-storage.md) for backend-specific setup.

## Custom Ingestion Workflows

Collections can reference bespoke workflows to process files before embedding. The workflow should expect:

- A `CollectionInput` node receiving `Collection(name=…)`.
- A `FileInput` node receiving `FilePath(path=…)`.

Return values can include summaries, metadata, or alternate embeddings. Review `packages/deploy/tests/collection-routes.test.ts` for a template.

## CLI & API Integration

- `POST /api/collections/:name/index` (see `@nodetool-ai/websocket` `packages/websocket/src/collection-api.ts`) triggers ingestion via HTTP (multipart/form-data file upload).
- The MCP server (`@nodetool-ai/websocket` `packages/websocket/src/mcp-server.ts`) exposes read-only collection tools — `get_collection`, `query_collection`, `list_collections`, `get_asset`, `list_assets` — for IDE plug-ins. It does **not** index assets.
- Admin routes under `@nodetool-ai/deploy` `packages/deploy/src/admin-routes.ts` provide remote ingestion endpoints for deployed servers.

## Troubleshooting

- **Missing collection metadata** – ensure the collection exists and includes the required `workflow` entry when using custom workflows.
- **Remote backend errors** – for `pinecone` or `supabase`, verify credentials and network reachability; fall back to local SQLite-vec by setting `NODETOOL_VECTOR_PROVIDER=sqlite-vec`.
- **Large files** – ensure `VECTORSTORE_DB_PATH` has disk headroom, or move to a remote backend; the default ingestion workflow streams chunks to reduce memory usage.

## Related Documentation

- [Providers](providers.md) – selecting embedding models for ingestion nodes.  
- [Workflow API](workflow-api.md) – details on `RunJobRequest`.  
- [Storage Guide](storage.md) – configuring persistent storage for uploaded documents.
