---
layout: page
title: "Indexing & Vector Stores"
description: "Ingest documents for semantic search and RAG with NodeTool's vector indexing pipeline — SQLite-vec by default, with pgvector and Pinecone options."
---



NodeTool ships a lightweight ingestion pipeline for semantic search and retrieval-augmented generation (RAG) tasks. The indexing logic is split across `@nodetool-ai/vectorstore` (store, chunking, and embedding) and `@nodetool-ai/websocket` (the upload route).

## Overview

- **Collection metadata** (`CollectionResponse` in `@nodetool-ai/protocol` `packages/protocol/src/api-types.ts`) carries the collection's name, document count, free-form metadata, and `workflow_name` — the resolved name of the workflow id stored under `metadata.workflow`, shown in listings.
- **Vector store** -- the default backend is SQLite-vec (`@nodetool-ai/vectorstore` `packages/vectorstore/src/sqlite-vec-store.ts`). Embeddings flow through the `VectorProvider` abstraction — see [Vector Storage](vector-storage.md) for swapping backends (Pinecone, Supabase/pgvector).
- **Indexing route** -- `handleCollectionRequest()` (`@nodetool-ai/websocket` `packages/websocket/src/collection-api.ts`) handles the multipart upload and performs the ingestion itself. It is the one collection endpoint that stayed on REST; every other CRUD and query endpoint moved to the tRPC `collections` router.

### Default Flow

1. `handleCollectionRequest()` matches `POST /api/collections/:name/index`, resolves the collection through `getDefaultVectorProvider().getCollection()`, and checks ownership with `canAccessCollection()` — someone else's collection answers `404`, not `403`, so the endpoint cannot be used to probe for names.
2. The uploaded file is rejected above `getMaxUploadBytes()` (`NODETOOL_MAX_UPLOAD_BYTES`), then read as text, split with `splitDocument()` from `@nodetool-ai/vectorstore`, and upserted into the collection as `<file name>#<n>` chunks carrying `source` and `start_index` metadata.
3. The route returns `{ path, chunks, error }`. A `CollectionNotFoundError` becomes `404`; any other provider error is logged and returned as a generic `500`, because provider errors carry SQL text, file paths, and upstream URLs.

## Configuring the vector store

The default backend is local SQLite-vec. Switch backends with `NODETOOL_VECTOR_PROVIDER`.

| Variable | Description | Default |
|----------|-------------|---------|
| `NODETOOL_VECTOR_PROVIDER` | `sqlite-vec`, `pinecone`, or `supabase` | `sqlite-vec` |
| `VECTORSTORE_DB_PATH` | Local SQLite-vec database file | `~/.local/share/nodetool/vectorstore.db` |
| `PINECONE_API_KEY` | Required when provider is `pinecone` | — |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Required when provider is `supabase` | — |

See [Vector Storage](vector-storage.md) for backend-specific setup.

## CLI & API Integration

- `POST /api/collections/:name/index` (see `@nodetool-ai/websocket` `packages/websocket/src/collection-api.ts`) triggers ingestion via HTTP (multipart/form-data file upload).
- The MCP server (`@nodetool-ai/websocket` `packages/websocket/src/mcp-server.ts`) exposes the CodeAct action tool `execute_code` plus `view_image` and the direct set. An IDE plug-in reads collections from inside an action — `nodetool.collections.list()` and `nodetool.collections.query()`. It does **not** index assets.
- A deployed server exposes no separate admin ingestion endpoints. The `/admin/*` surface `@nodetool-ai/deploy`'s client used to carry was ported from the retired Python server and never mounted; use `POST /api/collections/:name/index` against the deployment instead.

## Troubleshooting

- **Remote backend errors** – for `pinecone` or `supabase`, verify credentials and network reachability; fall back to local SQLite-vec by setting `NODETOOL_VECTOR_PROVIDER=sqlite-vec`.
- **Large files** – ensure `VECTORSTORE_DB_PATH` has disk headroom, or move to a remote backend.

## Related Documentation

- [Providers](providers.md) – selecting embedding models for ingestion nodes.  
- [Workflow API](workflow-api.md) – details on `RunJobRequest`.  
- [Storage Guide](storage.md) – configuring persistent storage for uploaded documents.
