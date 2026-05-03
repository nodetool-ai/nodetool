---
layout: page
title: "Index Aggregated Text"
node_type: "vector.IndexAggregatedText"
namespace: "vector"
---

**Type:** `vector.IndexAggregatedText`

**Namespace:** `vector`

## Description

Index multiple text chunks at once with aggregated embeddings from Ollama.
    vector, embedding, collection, RAG, index, text, chunk, batch, ollama

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| collection | `collection` | The collection to index | `{"type":"collection","name":""}` |
| document | `str` | The document to index | `` |
| document_id | `str` | The document ID to associate with the text | `` |
| metadata | `dict` | The metadata to associate with the text | `{}` |
| text_chunks | `list[union[text_chunk, str]]` | List of text chunks to index | `[]` |
| aggregation | `enum` | The aggregation method to use for the embeddings. | `mean` |

## Outputs

_(none)_

## Related Nodes

Browse other nodes in the [vector](../) namespace.
