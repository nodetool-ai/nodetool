---
layout: page
title: "Query Image"
node_type: "vector.chroma.QueryImage"
namespace: "vector.chroma"
---

**Type:** `vector.chroma.QueryImage`

**Namespace:** `vector.chroma`

## Description

Query the index for similar images.
    vector, RAG, query, image, search, similarity, chroma

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| collection | `collection` | The collection to query | `{'type': 'collection', 'name': ''}` |
| image | `image` | The image to query | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
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

