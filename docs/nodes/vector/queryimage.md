---
layout: page
title: "Query Image"
node_type: "vector.QueryImage"
namespace: "vector"
---

**Type:** `vector.QueryImage`

**Namespace:** `vector`

## Description

Query the index for similar images.
    vector, RAG, query, image, search, similarity

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| collection | `collection` | The collection to query | `{"type":"collection","name":""}` |
| image | `image` | The image to query | `{"type":"image","uri":"","asset_id":null,"data"...` |
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
