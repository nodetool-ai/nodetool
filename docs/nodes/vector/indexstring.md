---
layout: page
title: "Index String"
node_type: "vector.IndexString"
namespace: "vector"
---

**Type:** `vector.IndexString`

**Namespace:** `vector`

## Description

Index a string with a Document ID to a collection.
    vector, embedding, collection, RAG, index, text, string

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| collection | `collection` | The collection to index | `{"type":"collection","name":""}` |
| text | `str` | Text content to index | `` |
| document_id | `str` | Document ID to associate with the text content | `` |
| metadata | `dict` | The metadata to associate with the text | `{}` |

## Outputs

_(none)_

## Related Nodes

Browse other nodes in the [vector](../) namespace.
