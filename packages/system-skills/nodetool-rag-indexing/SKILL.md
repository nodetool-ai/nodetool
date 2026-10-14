---
name: nodetool-rag-indexing
description: "Build NodeTool document ingestion, vector indexing, retrieval, and RAG pipelines. Use when documents must be chunked into a vector collection and searched by meaning, or when an answer should come from the user's own documents. To find a stored image, video or file by name or tag, use asset_search instead."
featured: true
---

# Index documents and answer from them

A **collection** is a named vector store. Indexing splits documents into
chunks, embeds each chunk with the collection's embedding model and stores it.
Retrieval embeds the question with the same model and returns the closest
chunks, which a language model answers from.

```
INDEX:  documents → text → chunks → vector.IndexTextChunk → collection
QUERY:  question → vector.HybridSearch / QueryText → context → Agent → answer
```

## Search what is already indexed

Two tools are on the agent's belt in every chat:

- `list_collections` returns each collection the user can access, with its
  metadata (including `embedding_model`).
- `query_collection {collection, query, n_results?}` returns the closest chunks
  as `{id, document, score}`. `n_results` defaults to 5.

Answer from the returned chunks and say which chunk ids the answer used. An
empty result means the collection holds nothing close, not that the topic is
unknown.

The `vector_index`, `vector_batch_index`, `vector_text_search`,
`vector_hybrid_search`, `vector_recursive_split_and_index` and
`vector_markdown_split_and_index` tools act only on a collection a host binds
to the run. A chat binds none, so they return an error there. Index through the
nodes below instead.

## Index through nodes

All vector nodes are in the `vector` namespace.

| Node | Takes | Does |
|---|---|---|
| `vector.Collection` | `name`, `embedding_model` | Gets or creates the collection and outputs a `{type: "collection", name}` ref |
| `vector.IndexTextChunk` | `collection`, `document_id`, `text`, `metadata` | Upserts one chunk. The same `document_id` overwrites |
| `vector.IndexString` | `collection`, `text`, `document_id`, `metadata` | Upserts one string |
| `vector.IndexImage`, `vector.IndexEmbedding` | | Index an image or a precomputed embedding |
| `vector.QueryText` | `collection`, `text`, `n_results` | Vector search. Outputs `ids`, `documents`, `metadatas`, `distances` |
| `vector.HybridSearch` | `collection`, `text`, `n_results`, `k_constant`, `min_keyword_length` | Vector plus keyword search, fused by reciprocal rank. Adds `scores` |
| `vector.QueryImage` | `collection`, `image`, `n_results` | Image search |
| `vector.GetDocuments`, `vector.Peek`, `vector.Count` | `collection` | Inspect what is stored |
| `vector.RemoveOverlap` | `documents` | Removes text repeated between overlapping chunks |

The embedding model is set once, on `vector.Collection`'s `embedding_model`,
and stored in the collection's metadata. Index and query nodes take only the
collection, so indexing and search always use the same model. The shipped
example uses the Ollama model `nomic-embed-text`. Changing the model means a
new collection.

For a few chunks, `run_node` is enough: `run_node {node_type:
"vector.Collection", inputs: {name, embedding_model}}` once, then
`vector.IndexTextChunk` with `collection: {type: "collection", name}` per
chunk. For a folder of documents, build a workflow and run it.

### Index workflow

1. **List files.** A Code node with `await workspace.list(dir)`, or
   `nodetool.document.ListDocuments {folder, pattern, recursive}`.
2. **Load text.** `nodetool.document.LoadDocumentFile {path}` for text and
   Markdown. For PDFs use `lib.pdf.ExtractText` or `lib.pdf.ExtractMarkdown`.
3. **Chunk.** There is no chunking node. Use a Code node, starting from the
   "Chunk Text" snippet, and record the list with
   `await output("chunks", chunks)`. Read a document input with
   `await media.text(inputs.document)`.
4. **Fan out.** `nodetool.control.ForEach` emits each chunk on `output` and its
   position on `index`. Build a unique `document_id` from the file name and the
   index, for example with `nodetool.text.Template`.
5. **Index.** `vector.IndexTextChunk` with the collection ref, the chunk as
   `text`, the id as `document_id`, and `{source: <file name>}` as `metadata`.

Validate with `validate_workflow`, then run it. Indexing with a hosted
embedding model is billed per token, so confirm the size of the corpus with the
user before indexing a large folder.

| Content | Chunk size | Overlap |
|---|---|---|
| Technical docs | 200–500 tokens | about 50 tokens |
| Prose | 300–600 tokens | about 75 tokens |
| Code | 100–300 tokens | about 25 tokens |

### Query workflow

`StringInput` (question) → `vector.HybridSearch {collection, n_results: 5}` →
a Code node joining `documents` into one context string → `nodetool.text.Prompt`
or `Template` with the context and the question → `nodetool.agents.Agent` with a
system prompt that limits it to the context → `Output`.

The shipped example **Chat With Your Documents** builds a collection, indexes
three documents and answers from them. Load it with `get_example_workflow
{package_name: "nodetool-base", example_name: "Chat With Your Documents"}` and
adapt it rather than starting from nothing.

## Storage backends

The workflow nodes and tools are the same on every backend. The server picks
one at start from `NODETOOL_VECTOR_PROVIDER`:

| Value | Store | Configuration |
|---|---|---|
| `sqlite-vec` (default) | Local SQLite file | `VECTORSTORE_DB_PATH` to move it |
| `pinecone` | Pinecone | `PINECONE_API_KEY`, optional `PINECONE_ENVIRONMENT`, `PINECONE_CONTROLLER_HOST` |
| `supabase` | Postgres with pgvector | `SUPABASE_URL` and `SUPABASE_KEY` or `SUPABASE_SERVICE_ROLE_KEY`, plus `packages/vectorstore/sql/supabase-migration.sql` applied to the project |

Any other value stops the server with an error. These are server environment
variables, set by whoever runs the server, not by the agent.

## From a shell or over HTTP

For a person with a shell, the `nodetool collections` CLI manages collections
on the local server:

```bash
nodetool collections create handbook --embedding-model nomic-embed-text --embedding-provider ollama
nodetool collections index handbook ./docs/*.md
nodetool collections query handbook "refund policy" -n 5
nodetool collections list
nodetool collections delete handbook --yes
```

`POST /api/collections/<name>/index` takes one text file as a
`multipart/form-data` upload in the `file` field, chunks it and indexes it into
an existing collection that has an embedding model. Plain text, Markdown, HTML,
CSV and JSON are accepted. PDFs, Office files and images need an indexing
workflow.

```bash
curl -X POST http://localhost:7777/api/collections/handbook/index \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./docs/refunds.md"
```

## Pitfalls

- **A collection with no embedding model** cannot be searched. Create it with
  one.
- **Chunks too large** dilute the context. **Chunks too small** split
  sentences. Keep 10–20% overlap.
- **Reused `document_id`s** overwrite each other. Include the file name in the
  id.
- **Querying before indexing** returns nothing.
- **Node names**: `vector.IndexTextChunk`, `vector.QueryText`,
  `vector.HybridSearch`. There is no `vector.chroma.*` or `vector.faiss.*`, and
  no `nodetool.text.Chunk`.
