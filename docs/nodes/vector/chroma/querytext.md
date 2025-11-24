---
layout: page
title: "Query Text"
node_type: "vector.chroma.QueryText"
namespace: "vector.chroma"
---

**Type:** `vector.chroma.QueryText`

**Namespace:** `vector.chroma`

## Description

Query the index for similar text.
    vector, RAG, query, text, search, similarity, chroma

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| collection | `collection` | The collection to query | `{'type': 'collection', 'name': ''}` |
| text | `str` | The text to query | `` |
| n_results | `int` | The number of results to return | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| ids | `List[str]` |  |
| documents | `List[str]` |  |
| metadatas | `List[Dict[Any, Any]]` |  |
| distances | `List[float]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [vector.chroma](../) namespace.

