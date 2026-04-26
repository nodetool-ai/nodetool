---
name: nodetool-rag-indexing
description: Set up RAG pipelines, vector indexing, document ingestion, ChromaDB/FAISS/SQLite-vec search, and knowledge base creation in NodeTool. Use when user asks about RAG, document indexing, vector search, chat with documents, knowledge base, embeddings, or collection management.
---

You help users build Retrieval-Augmented Generation (RAG) pipelines in NodeTool.

# RAG Architecture

```
INDEXING:  Documents → Extract → Split → Embed → Store (vector DB)
QUERY:    Question → Embed → Search → Format → LLM → Answer
```

# Vector Store Options

| Backend | Best For | Config |
|---------|----------|--------|
| **SQLite-vec** | Default, local, embedded | `DB_PATH` (automatic) |
| **ChromaDB** | Production, remote | `CHROMA_URL`, `CHROMA_PATH` |
| **FAISS** | High-speed similarity | In-memory or file-backed |

# Indexing Pipeline

## Default Flow (automatic)

```
File → splitDocument() → embed → store in SQLite-vec
```

The `indexFileToCollection()` function orchestrates:
1. Resolve collection via `getCollection()`
2. If custom workflow exists: execute it
3. Fallback: `splitDocument()` → embed → store

## CLI / API Indexing

```bash
# Index via HTTP API
curl -X POST http://localhost:7777/collections/<name>/index \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"file_path": "/path/to/document.pdf"}'
```

## Workflow-Based Indexing

Build a workflow with these nodes:

**Input nodes:**
- `nodetool.input.StringInput` — collection name
- `nodetool.input.StringInput` — file path

**Processing chain:**
```
ListFiles → LoadDocument → ExtractText → SentenceSplitter → IndexTextChunks
```

| Node | Namespace | Purpose |
|------|-----------|---------|
| `ListFiles` | `lib.os` | Enumerate files in directory |
| `LoadDocument` | `nodetool.text` | Load PDF/DOCX/TXT/MD |
| `ExtractText` | `lib.pdf` | Extract text from PDFs |
| `SentenceSplitter` | `nodetool.text` | Split into chunks |
| `IndexTextChunks` | `vector.chroma` or `vector.faiss` | Store embeddings |

## Chunk Size Guidance

| Content Type | Chunk Size | Overlap |
|-------------|-----------|---------|
| Technical docs | 200-500 tokens | 50 tokens |
| Prose/articles | 300-600 tokens | 75 tokens |
| Code | 100-300 tokens | 25 tokens |
| Q&A pairs | Per question | None |

# Query Pipeline

Build a workflow with these nodes:

```
ChatInput → HybridSearch → FormatText → Agent → Output
```

| Node | Purpose |
|------|---------|
| `ChatInput` | User question input |
| `HybridSearch` | Vector + keyword search (best accuracy) |
| `TextSearch` | Vector-only search (faster) |
| `FormatText` | Format results as context for LLM |
| `Agent` | Generate answer from context + question |
| `Output` | Return answer |

## Search Types

| Type | Node | Accuracy | Speed |
|------|------|----------|-------|
| **Hybrid** | `vector.chroma.HybridSearch` | Best | Slower |
| **Vector** | `vector.chroma.TextSearch` | Good | Fast |
| **FAISS** | `vector.faiss.Search` | Good | Fastest |

# ChromaDB Nodes (`vector.chroma.*`)

| Node | Purpose |
|------|---------|
| `CreateCollection` | Create a new collection |
| `DeleteCollection` | Delete a collection |
| `ListCollections` | List all collections |
| `GetCollection` | Get collection details |
| `IndexTextChunks` | Index text chunks with embeddings |
| `IndexDocuments` | Index full documents |
| `TextSearch` | Vector similarity search |
| `HybridSearch` | Vector + keyword search |
| `DeleteDocuments` | Remove documents from collection |
| `GetDocuments` | Retrieve specific documents |
| `UpdateDocuments` | Update document content |
| `Count` | Count documents in collection |
| `Peek` | Preview collection contents |

# FAISS Nodes (`vector.faiss.*`)

| Node | Purpose |
|------|---------|
| `CreateIndex` | Create FAISS index |
| `AddVectors` | Add vectors to index |
| `Search` | Similarity search |
| `Save` | Save index to disk |
| `Load` | Load index from disk |
| `Remove` | Remove vectors |
| `Count` | Count vectors |

# Environment Variables

```bash
# ChromaDB
CHROMA_URL=                          # Remote Chroma URL (leave empty for local)
CHROMA_PATH=~/.local/share/nodetool/chroma  # Local storage path
CHROMA_TOKEN=                        # Optional auth token

# Embedding model (defaults to sentence-transformers)
# Configure via model selection in IndexTextChunks node
```

# Complete RAG Example (Workflow Pattern)

## Step 1: Index Documents
```
StringInput("my-docs") → CreateCollection
                          ↓
ListFiles("/docs/") → ForEach → LoadDocument → ExtractText
                                                    ↓
                                    SentenceSplitter(chunk_size=400, overlap=50)
                                                    ↓
                                    IndexTextChunks(collection="my-docs")
```

## Step 2: Query
```
ChatInput("What is...?") → HybridSearch(collection="my-docs", top_k=5)
                                    ↓
                           FormatText(template="Context:\n{results}\n\nQuestion: {query}")
                                    ↓
                           Agent(model=gpt-4o, system="Answer using only the context provided.")
                                    ↓
                           Output
```

# Custom Ingestion Workflows

For non-standard documents, create a custom workflow with:
- **Input**: `CollectionInput(name=...)` + `FileInput(path=...)`
- **Processing**: Custom extraction, metadata enrichment, specialized chunking
- **Output**: Summaries, metadata, or alternate embeddings

Register the workflow as the collection's ingestion handler.

# Collection Management

```bash
# List collections
nodetool collections list

# Create collection
nodetool collections create my-docs

# Index files
nodetool collections index my-docs /path/to/files/

# Search
nodetool collections search my-docs "query text"

# Delete
nodetool collections delete my-docs
```

# Common Pitfalls

- **Embedding model mismatch**: Use the same embedding model for indexing and search
- **Chunks too large**: LLM context gets diluted; keep to 200-500 tokens
- **Chunks too small**: Loss of context; sentences get fragmented
- **No overlap**: Related content split across chunks; use 10-20% overlap
- **Not checking results**: Always test search quality before building full pipeline
- **Missing collection**: Index before querying — empty collection returns nothing
