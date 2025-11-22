---
layout: page
title: "Index String"
node_type: "vector.chroma.IndexString"
namespace: "vector.chroma"
---

**Type:** `vector.chroma.IndexString`

**Namespace:** `vector.chroma`

## Description

Index a string with a Document ID to a collection.
    vector, embedding, collection, RAG, index, text, string, chroma

    Use cases:
    - Index documents for a vector search

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| collection | `collection` | The collection to index | `{'type': 'collection', 'name': ''}` |
| text | `str` | Text content to index | `` |
| document_id | `str` | Document ID to associate with the text content | `` |
| metadata | `Dict[Any, Any]` | The metadata to associate with the text | `{}` |

## Metadata

## Related Nodes

Browse other nodes in the [vector.chroma](../) namespace.

