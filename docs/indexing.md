---
layout: page
title: "Indexing & Vector Stores"
description: "Index documents into a vector collection through the upload route or vector.Index nodes, with the route's status codes and chunking defaults."
---



Documents are indexed either through the upload route `POST /api/collections/:name/index` or through `vector.Index*` nodes in a workflow. Chunking and storage live in `@nodetool-ai/vectorstore`, and the upload route in `@nodetool-ai/websocket`.

```bash
curl -X POST http://localhost:7777/api/collections/support/index -F "file=@guide.txt"
# {"path":"guide.txt","chunks":12,"error":null}
```

## Overview

- **Collection metadata** (`CollectionResponse` in `packages/protocol/src/api-types.ts`) carries the name, document count, free-form metadata, and `workflow_name`, the resolved name of the workflow id stored under `metadata.workflow`.
- **Vector store**: SQLite-vec by default (`packages/vectorstore/src/sqlite-vec-store.ts`), behind the `VectorProvider` abstraction. See [Vector Storage](vector-storage.md) for the other backends.
- **Indexing route**: `handleCollectionRequest()` (`packages/websocket/src/collection-api.ts`) handles the multipart upload and ingests it. It is the one collection endpoint still on REST. The rest moved to the tRPC `collections` router.

### Upload route flow

1. `handleCollectionRequest()` resolves the collection through `getDefaultVectorProvider().getCollection()` and checks ownership with `canAccessCollection()`. Someone else's collection answers `404`, not `403`, so names cannot be probed.
2. The body must be `multipart/form-data` with a `file` field, otherwise `400`. A method other than `POST` answers `405`. A file above `getMaxUploadBytes()` (`NODETOOL_MAX_UPLOAD_BYTES`, 1 GiB by default) answers `413`.
3. The file is read as UTF-8 text, split by `splitDocument()` (2000 characters per chunk, 1000 overlap), and upserted as `<file name>#<n>` chunks with `source` and `start_index` metadata. An empty or whitespace-only file produces zero chunks.
4. The route returns `{ path, chunks, error }`. A `CollectionNotFoundError` becomes `404`. Any other provider error is logged and returned as a generic `500`, because provider errors carry SQL text, file paths, and upstream URLs.

The route reads text only, so PDF, DOCX, and other binary formats are not extracted. It opens the collection with no embedding function, so it stores chunk text without calling the embedding model. To embed during ingestion, use the `vector.Index*` nodes below.

## Indexing from a workflow

Each node takes a `collection` input. The `vector.Collection` node gets or creates a collection by name and embedding model.

| Node | Purpose |
|---|---|
| `vector.IndexString` | Index a string under a document id |
| `vector.IndexTextChunk` | Index a single text chunk |
| `vector.IndexAggregatedText` | Index several text chunks with aggregated embeddings from Ollama |
| `vector.IndexImage` | Index a list of image assets or files |
| `vector.IndexEmbedding` | Index one precomputed embedding vector, with optional metadata |
| `vector.QueryText`, `vector.QueryImage` | Similarity search by text or image |
| `vector.HybridSearch` | Fuses a semantic ranking with a keyword-filtered one by reciprocal rank fusion |
| `vector.Count`, `vector.GetDocuments`, `vector.Peek` | Inspect a collection |
| `vector.RemoveOverlap` | Removes overlapping words between consecutive strings in a list |

Definitions are in `packages/core-nodes/src/nodes/vector.ts`. To index a PDF, extract its text first with a node such as `lib.pdf.ExtractText`.

## Configuring the vector store

`NODETOOL_VECTOR_PROVIDER` (`sqlite-vec` default, `pinecone`, `supabase`), `VECTORSTORE_DB_PATH`, and the Supabase and Pinecone variables are listed in [Vector Storage](vector-storage.md#configuration).

## CLI & API Integration

- The MCP server (`packages/websocket/src/mcp-server.ts`) exposes the CodeAct tool `execute_code`, `view_image`, and the direct set. An IDE plug-in reads collections from inside an action with `nodetool.collections.list()` and `nodetool.collections.query()`. It does **not** index assets.
- A deployed server has no separate admin ingestion endpoints. The `/admin/*` surface in `@nodetool-ai/deploy`'s client came from the retired Python server and was never mounted. Use `POST /api/collections/:name/index` on the deployment.

## If it fails

- **Supabase errors**: check `SUPABASE_URL`, the key, and that `packages/vectorstore/sql/supabase-migration.sql` ran on the project. Set `NODETOOL_VECTOR_PROVIDER=sqlite-vec` to fall back to local storage.
- **Pinecone errors**: the provider is a stub that throws on use.
- **Large files**: `VECTORSTORE_DB_PATH` needs disk headroom, or use a remote backend.

## Related Documentation

- [Providers](providers.md)
- [Workflow API](workflow-api.md)
- [Storage Guide](storage.md)
