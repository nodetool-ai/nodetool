---
layout: page
title: "Index Image"
node_type: "vector.chroma.IndexImage"
namespace: "vector.chroma"
---

**Type:** `vector.chroma.IndexImage`

**Namespace:** `vector.chroma`

## Description

Index a list of image assets or files.
    vector, embedding, collection, RAG, index, image, batch, chroma

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| collection | `collection` | The collection to index | `{'type': 'collection', 'name': ''}` |
| image | `image` | List of image assets to index | `[]` |
| index_id | `str` | The ID to associate with the image, defaults to the URI of the image | `` |
| metadata | `Dict[Any, Any]` | The metadata to associate with the image | `{}` |
| upsert | `bool` | Whether to upsert the images | `False` |

## Metadata

## Related Nodes

Browse other nodes in the [vector.chroma](../) namespace.

