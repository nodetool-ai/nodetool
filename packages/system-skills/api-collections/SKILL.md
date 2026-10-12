---
name: api-collections
description: "Call nodetool.collections from a code action: list the user's knowledge collections and run a semantic search in one of them. Indexing is not available from code; build it with nodetool-rag-indexing. Load before the first call into nodetool.collections."
---

# nodetool.collections

The vector store behind retrieval. A collection holds document chunks with
embeddings for semantic search. It is not an asset folder. How to chunk, index
and build a RAG workflow is `nodetool-rag-indexing`.

| Call | Does |
| :--- | :--- |
| `list()` | Lists the collections the user has. |
| `query(collection, query, {n_results})` | Semantic search in one named collection. `n_results` defaults to 5. |

`index`, `indexBatch`, `search` and `hybridSearch` also exist on
`nodetool.collections`, but their tools are on no tool belt this product
ships, so each one throws "not in this toolbelt". Do not plan on them. To add
documents to a collection, build an indexing workflow as `nodetool-rag-indexing`
describes and run it with `nodetool.workflows.run`.

## Rules

- Call `list()` first when you do not know the collection name.
- An empty result from a collection the user just made usually means nothing
  was indexed yet. Say so instead of retrying the query.

```js
const { collections } = await nodetool.collections.list();
const hits = await nodetool.collections.query("manuals", "reset the device",
  { n_results: 8 });
```
