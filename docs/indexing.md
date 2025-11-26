---
layout: page
title: "Indexing & Vector Stores"
---



NodeTool ships a lightweight ingestion pipeline for semantic search and retrieval-augmented generation (RAG) tasks. The indexing service lives in `src/nodetool/indexing`.

## Overview

- **Collection metadata** (`nodetool.metadata.types.Collection`) stores ingest configuration, including an optional workflow ID.
- **Vector store clients** – the default backend is Chroma (`src/nodetool/integrations/vectorstores/chroma/async_chroma_client.py`), accessed asynchronously.
- **Indexing service** – `index_file_to_collection()` (`src/nodetool/indexing/service.py:20`) orchestrates ingestion based on collection metadata.

### Default Flow

1. `index_file_to_collection()` resolves the target collection via `get_async_collection()`.
2. If the collection specifies a custom workflow ID, the service executes it by constructing a `RunJobRequest` (`src/nodetool/indexing/service.py:49`) with `CollectionInput` and `FileInput` nodes populated.
3. Otherwise, it falls back to `default_ingestion_workflow_async()` (`src/nodetool/indexing/ingestion.py:1`), which chunkifies the document, embeds it, and stores embeddings in Chroma.

### Messages & Progress

While custom workflows run, the service streams `JobUpdate`, `NodeUpdate`, and progress messages (from `src/nodetool/workflows/run_workflow.py`). Tests under `tests/integrations/test_indexing.py` cover expected message sequences.

## Configuring Chroma

Environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `CHROMA_URL` | Remote Chroma server URL | `None` (use local DB) |
| `CHROMA_PATH` | Local data directory | `~/.local/share/nodetool/chroma` |

For remote Chroma, set `CHROMA_TOKEN` if authentication is required. The async client automatically switches between HTTP and local storage depending on `CHROMA_URL`.

## Custom Ingestion Workflows

Collections can reference bespoke workflows to process files before embedding. The workflow should expect:

- A `CollectionInput` node receiving `Collection(name=…)`.
- A `FileInput` node receiving `FilePath(path=…)`.

Return values can include summaries, metadata, or alternate embeddings. Review `tests/integrations/test_custom_ingestion.py` for a template.

## CLI & API Integration

- `POST /collections/{name}/index` (see `src/nodetool/api/collection.py`) triggers ingestion via HTTP.
- The MCP server (`src/nodetool/api/mcp_server.py:1889`) exposes commands for IDE plug-ins to index assets.
- Admin routes under `src/nodetool/deploy/admin_routes.py` provide remote ingestion endpoints for deployed workers.

## Troubleshooting

- **Missing collection metadata** – ensure the collection exists and includes the required `workflow` entry when using custom workflows.
- **Chroma connection errors** – verify `CHROMA_URL`/`CHROMA_TOKEN` and network reachability; fall back to local mode by clearing the URL.
- **Large files** – increase `CHROMA_PATH` disk quota or configure cloud storage; the default ingestion workflow streams chunks to reduce memory usage.

## Related Documentation

- [Providers](providers.md) – selecting embedding models for ingestion nodes.  
- [Workflow API](workflow-api.md) – details on `RunJobRequest`.  
- [Storage Guide](storage.md) – configuring persistent storage for uploaded documents.
