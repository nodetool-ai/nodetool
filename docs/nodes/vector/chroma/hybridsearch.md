---
layout: page
title: "Hybrid Search"
node_type: "vector.chroma.HybridSearch"
namespace: "vector.chroma"
---

**Type:** `vector.chroma.HybridSearch`

**Namespace:** `vector.chroma`

## Description

Hybrid search combining semantic and keyword-based search for better retrieval. Uses reciprocal rank fusion to combine results from both methods.
    vector, RAG, query, semantic, text, similarity, chroma

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| collection | `collection` | The collection to query | `{'type': 'collection', 'name': ''}` |
| text | `str` | The text to query | `` |
| n_results | `int` | The number of final results to return | `5` |
| k_constant | `float` | Constant for reciprocal rank fusion (default: 60.0) | `60.0` |
| min_keyword_length | `int` | Minimum length for keyword tokens | `3` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| ids | `List[str]` |  |
| documents | `List[str]` |  |
| metadatas | `List[Dict[Any, Any]]` |  |
| distances | `List[float]` |  |
| scores | `List[float]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [vector.chroma](../) namespace.

