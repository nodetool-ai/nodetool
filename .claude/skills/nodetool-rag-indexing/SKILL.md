---
name: nodetool-rag-indexing
description: Set up RAG pipelines, vector indexing, document ingestion, vector search, and knowledge base creation in NodeTool. Use when user asks about RAG, document indexing, vector search, chat with documents, knowledge base, embeddings, or collection management.
---

You help users build Retrieval-Augmented Generation (RAG) pipelines in NodeTool.

# RAG Architecture

```
INDEXING:  Documents → Load → Split → Embed → Store (vector collection)
QUERY:     Question → Embed → Search → Format → LLM → Answer
```

# Vector Store Backends

NodeTool's vector store (`@nodetool-ai/vectorstore`) is backend-pluggable. The
workflow nodes are the same regardless of backend — you pick the backend via
configuration.

| Backend | Best for | Notes |
|---------|----------|-------|
| **SQLite-vec** | Default, local, embedded | No external service |
| **ChromaDB** | Self-host / remote | `CHROMA_URL`, `CHROMA_PATH`, `CHROMA_TOKEN` |
| **Pinecone** | Managed cloud | API-key based |
| **Supabase (pgvector)** | Postgres-backed | Pairs with Supabase auth/storage |

There are **no FAISS nodes**; the backends above cover local and hosted use.

# Vector Nodes (`vector.*`)

All RAG nodes live under the single `vector.*` namespace (not `vector.chroma.*`
or `vector.faiss.*`).

| Node | Purpose |
|------|---------|
| `vector.Collection` | Reference/select a collection by name (the collection ref other nodes consume) |
| `vector.IndexTextChunk` | Index a single text chunk with its embedding |
| `vector.IndexString` | Index a string value |
| `vector.IndexAggregatedText` | Index aggregated text |
| `vector.IndexEmbedding` | Index a precomputed embedding |
| `vector.IndexImage` | Index an image |
| `vector.QueryText` | Vector similarity search over text |
| `vector.QueryImage` | Vector similarity search over images |
| `vector.HybridSearch` | Vector + keyword search (best accuracy) |
| `vector.GetDocuments` | Retrieve specific documents |
| `vector.Count` | Count documents in a collection |
| `vector.Peek` | Preview collection contents |
| `vector.RemoveOverlap` | De-duplicate overlapping chunks in results |

Query nodes (`QueryText`, `QueryImage`, `HybridSearch`) output `ids`,
`documents`, `metadatas`, and `distances` (HybridSearch also returns `scores`).

# Document Loading & Splitting (`nodetool.document.*`, `lib.os.*`)

| Node | Namespace | Purpose |
|------|-----------|---------|
| `ListFiles` | `lib.os` | Enumerate files in a directory |
| `LoadDocumentFile` | `nodetool.document` | Load a PDF/DOCX/TXT/MD into a document |
| `SplitRecursively` | `nodetool.document` | Recursive character/token splitting (general purpose) |
| `SplitMarkdown` | `nodetool.document` | Split Markdown by structure |
| `SplitHTML` / `SplitJSON` | `nodetool.document` | Structure-aware splitting |
| `SplitDocument` | `nodetool.document` | Split a loaded document |

## Chunk Size Guidance

| Content type | Chunk size | Overlap |
|--------------|-----------|---------|
| Technical docs | 200-500 tokens | 50 tokens |
| Prose/articles | 300-600 tokens | 75 tokens |
| Code | 100-300 tokens | 25 tokens |

# Indexing — Workflow Pattern

```
ListFiles → LoadDocumentFile → SplitRecursively → IndexTextChunk(collection)
```

Pair every index/query node with a `vector.Collection` node (or a collection
name) so they target the same store. Use the **same embedding model** for
indexing and querying.

# Indexing — HTTP API

```bash
# Index a file into a collection
curl -X POST http://localhost:7777/api/collections/<name>/index \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"file_path": "/path/to/document.pdf"}'
```

The server resolves the collection, runs its ingestion workflow if one is
registered, otherwise falls back to split → embed → store.

# Query — Workflow Pattern

```
ChatInput → HybridSearch(collection, top_k) → FormatText → Agent → Output
```

| Node | Purpose |
|------|---------|
| `ChatInput` | User question |
| `vector.HybridSearch` | Vector + keyword retrieval (best accuracy) |
| `vector.QueryText` | Vector-only retrieval (faster) |
| `FormatText` | Build the context string for the LLM |
| `Agent` | Generate the answer from context + question |
| `Output` | Return the answer |

# Complete RAG Example

## Index
```
ListFiles("/docs/") → LoadDocumentFile → SplitRecursively(chunk_size=400, overlap=50)
                                                  ↓
                                  IndexTextChunk(collection="my-docs")
```

## Query
```
ChatInput("What is...?") → HybridSearch(collection="my-docs", top_k=5)
                                  ↓
                         FormatText(template="Context:\n{documents}\n\nQuestion: {query}")
                                  ↓
                         Agent(model=gpt-5.4, system="Answer using only the context provided.")
                                  ↓
                         Output
```

# Environment Variables

```bash
# ChromaDB backend (only when using Chroma — SQLite-vec needs no config)
CHROMA_URL=                          # Remote Chroma URL (empty = local)
CHROMA_PATH=~/.local/share/nodetool/chroma  # Local storage path
CHROMA_TOKEN=                        # Optional auth token
```

The embedding model is chosen on the index/query nodes via model selection
(e.g. `text-embedding-3-small`, or a local sentence-transformers model).

# Common Pitfalls

- **Embedding model mismatch**: use the same embedding model for indexing and search.
- **Chunks too large**: dilute the LLM context — keep to 200-500 tokens.
- **Chunks too small**: sentences get fragmented; use 10-20% overlap.
- **Empty collection**: index before querying — an unindexed collection returns nothing.
- **Wrong node names**: it's `vector.IndexTextChunk` / `vector.QueryText` / `vector.HybridSearch`, not `IndexTextChunks` / `TextSearch`, and there is no `vector.chroma.*`/`vector.faiss.*` namespace.
- **No `nodetool collections` CLI**: manage collections through the editor UI or the `/api/collections/...` endpoints.
