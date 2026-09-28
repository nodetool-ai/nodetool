---
name: api-collections
description: "Call nodetool.collections from a code action: index text chunks into the vector store, search them semantically or with hybrid keyword search, and query a named knowledge collection. Load before the first call into nodetool.collections."
---

# nodetool.collections

The vector store behind retrieval. A collection indexes document chunks with
embeddings for semantic or hybrid search. It is not an asset folder. How to
chunk, what metadata to keep and how to build a RAG workflow is
`nodetool-rag-indexing`.

| Call | Does |
| :--- | :--- |
| `list()` | Lists the collections the user has. |
| `query(collection, query, {n_results})` | Semantic search in one named collection. `n_results` defaults to 5. |
| `index(text, sourceId, {metadata})` | Indexes one chunk. Indexing the same `sourceId` again updates it. |
| `indexBatch(chunks, {base_metadata})` | Indexes many chunks: `[{text, source_id, metadata?}]`. `base_metadata` is added to each. |
| `search(text, {n_results})` | Semantic search across all collections. `n_results` defaults to 10. |
| `hybridSearch(text, {n_results, k_constant, min_keyword_length})` | Semantic plus keyword search, fused by reciprocal rank. `n_results` is per collection, default 5. `k_constant` defaults to 60. |

## Rules

- Call `list()` first when you do not know the collection name.
- Give each chunk a stable `source_id`, such as `"<file>#<chunk-number>"`, so a
  second indexing pass updates chunks instead of adding copies.
- Put what you filter or cite by in `metadata`: the source file, the page, the
  title, the URL.
- Use `hybridSearch` when the query has exact names, codes or rare words that
  embeddings miss.
- Index in batches with `indexBatch`, not one `index` call for each chunk.

```js
const text = (await nodetool.documents.extractText("manual.pdf")).text;
const chunks = text.match(/[\s\S]{1,1200}/g).map((t, i) => ({
  text: t, source_id: `manual.pdf#${i}`, metadata: { file: "manual.pdf" }
}));
await nodetool.collections.indexBatch(chunks);
const hits = await nodetool.collections.hybridSearch("reset the device");
```
