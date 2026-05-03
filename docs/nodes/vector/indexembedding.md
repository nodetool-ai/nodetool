---
layout: page
title: "Index Embedding"
node_type: "vector.IndexEmbedding"
namespace: "vector"
---

**Type:** `vector.IndexEmbedding`

**Namespace:** `vector`

## Description

Index a single embedding vector into a collection with optional metadata. Creates a searchable entry that can be queried for similarity matching.
    vector, index, embedding, storage, RAG

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| collection | `collection` | The collection to index | `{"type":"collection","name":""}` |
| embedding | `list` | The embedding to index | `{"type":"list","value":null,"dtype":"<i8","shap...` |
| index_id | `union[str, list[str]]` | The ID to associate with the embedding | `` |
| metadata | `union[dict, list[dict]]` | The metadata to associate with the embedding | `{}` |

## Outputs

_(none)_

## Related Nodes

Browse other nodes in the [vector](../) namespace.
