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
| collection | `collection` | The collection to index | `{'type': 'collection', 'name': ''}` |
| document | `str` | The document to index | `` |
| document_id | `str` | The document ID to associate with the text | `` |
| metadata | `Dict[Any, Any]` | The metadata to associate with the text | `{}` |
| text_chunks | `List[(text_chunk | str)]` | List of text chunks to index | `[]` |
| context_window | `int` | The context window size to use for the model | `4096` |
| aggregation | `Enum['mean', 'max', 'min', 'sum']` | The aggregation method to use for the embeddings. | `mean` |

## Metadata

## Related Nodes

Browse other nodes in the [vector.chroma](../) namespace.

