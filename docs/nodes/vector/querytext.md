---
layout: page
title: "Query Text"
node_type: "vector.QueryText"
namespace: "vector"
---

**Type:** `vector.QueryText`

**Namespace:** `vector`

## Description

Query the index for similar text.
    vector, RAG, query, text, search, similarity

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| collection | `collection` | The collection to query | `{"type":"collection","name":""}` |
| text | `str` | The text to query | `` |
| n_results | `int` | The number of results to return | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| ids | `list[str]` |  |
| documents | `list[str]` |  |
| metadatas | `list[dict]` |  |
| distances | `list[float]` |  |

## Related Nodes

Browse other nodes in the [vector](../) namespace.
