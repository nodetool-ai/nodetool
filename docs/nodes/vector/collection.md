---
layout: page
title: "Collection"
node_type: "vector.Collection"
namespace: "vector"
---

**Type:** `vector.Collection`

**Namespace:** `vector`

## Description

Get or create a named vector database collection for storing embeddings.
    vector, embedding, collection, RAG, get, create

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The name of the collection to create | `` |
| embedding_model | `llama_model` | Model to use for embedding, search for nomic-embed-text and download it | `{"type":"llama_model","name":"","repo_id":"","m...` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `collection` |  |

## Related Nodes

Browse other nodes in the [vector](../) namespace.
