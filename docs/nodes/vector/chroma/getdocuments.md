---
layout: page
title: "Get Documents"
node_type: "vector.chroma.GetDocuments"
namespace: "vector.chroma"
---

**Type:** `vector.chroma.GetDocuments`

**Namespace:** `vector.chroma`

## Description

Get documents from a chroma collection.
    vector, embedding, collection, RAG, retrieve, chroma

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| collection | `collection` | The collection to get | `{'type': 'collection', 'name': ''}` |
| ids | `List[str]` | The ids of the documents to get | `[]` |
| limit | `int` | The limit of the documents to get | `100` |
| offset | `int` | The offset of the documents to get | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[str]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [vector.chroma](../) namespace.

