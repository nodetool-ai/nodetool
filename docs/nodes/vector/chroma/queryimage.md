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
| collection | `any` | The collection to query | `{'type': 'collection', 'name': ''}` |
| image | `any` | The image to query | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| n_results | `any` | The number of results to return | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| ids | `any` |  |
| documents | `any` |  |
| metadatas | `any` |  |
| distances | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [vector.chroma](../) namespace.

