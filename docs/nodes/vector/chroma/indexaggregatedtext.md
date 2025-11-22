---
layout: page
title: "Index Aggregated Text"
node_type: "vector.chroma.IndexAggregatedText"
namespace: "vector.chroma"
---

**Type:** `vector.chroma.IndexAggregatedText`

**Namespace:** `vector.chroma`

## Description

Index multiple text chunks at once with aggregated embeddings from Ollama.
    vector, embedding, collection, RAG, index, text, chunk, batch, ollama, chroma

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| collection | `any` | The collection to index | `{'type': 'collection', 'name': ''}` |
| document | `any` | The document to index | `` |
| document_id | `any` | The document ID to associate with the text | `` |
| metadata | `any` | The metadata to associate with the text | `{}` |
| text_chunks | `any` | List of text chunks to index | `[]` |
| context_window | `any` | The context window size to use for the model | `4096` |
| aggregation | `any` | The aggregation method to use for the embeddings. | `mean` |

## Metadata

## Related Nodes

Browse other nodes in the [vector.chroma](../) namespace.

