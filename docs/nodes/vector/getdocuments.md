---
layout: page
title: "Get Documents"
node_type: "vector.GetDocuments"
namespace: "vector"
---

**Type:** `vector.GetDocuments`

**Namespace:** `vector`

## Description

Get documents from a collection.
    vector, embedding, collection, RAG, retrieve

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| collection | `collection` | The collection to get | `{"type":"collection","name":""}` |
| ids | `list[str]` | The ids of the documents to get | `[]` |
| limit | `int` | The limit of the documents to get | `100` |
| offset | `int` | The offset of the documents to get | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[str]` |  |

## Related Nodes

Browse other nodes in the [vector](../) namespace.
