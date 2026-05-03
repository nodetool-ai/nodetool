---
layout: page
title: "Index Image"
node_type: "vector.IndexImage"
namespace: "vector"
---

**Type:** `vector.IndexImage`

**Namespace:** `vector`

## Description

Index a list of image assets or files.
    vector, embedding, collection, RAG, index, image, batch

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| collection | `collection` | The collection to index | `{"type":"collection","name":""}` |
| image | `image` | List of image assets to index | `[]` |
| index_id | `str` | The ID to associate with the image, defaults to the URI of the image | `` |
| metadata | `dict` | The metadata to associate with the image | `{}` |
| upsert | `bool` | Whether to upsert the images | `false` |

## Outputs

_(none)_

## Related Nodes

Browse other nodes in the [vector](../) namespace.
