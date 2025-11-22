---
layout: page
title: "Index Embedding"
node_type: "vector.chroma.IndexEmbedding"
namespace: "vector.chroma"
---

**Type:** `vector.chroma.IndexEmbedding`

**Namespace:** `vector.chroma`

## Description

Index a single embedding vector into a Chroma collection with optional metadata. Creates a searchable entry that can be queried for similarity matching.
    vector, index, embedding, chroma, storage, RAG

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| collection | `any` | The collection to index | `{'type': 'collection', 'name': ''}` |
| embedding | `any` | The embedding to index | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| index_id | `any` | The ID to associate with the embedding | `` |
| metadata | `any` | The metadata to associate with the embedding | `{}` |

## Metadata

## Related Nodes

Browse other nodes in the [vector.chroma](../) namespace.

