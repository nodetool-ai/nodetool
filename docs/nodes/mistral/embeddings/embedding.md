---
layout: page
title: "Embedding"
node_type: "mistral.embeddings.Embedding"
namespace: "mistral.embeddings"
---

**Type:** `mistral.embeddings.Embedding`

**Namespace:** `mistral.embeddings`

## Description

Generate vector embeddings using Mistral AI.
    mistral, embeddings, vectors, semantic, similarity, search

    Uses Mistral AI's embedding model to create dense vector representations of text.
    These vectors capture semantic meaning, enabling:
    - Semantic search
    - Text clustering
    - Document classification
    - Recommendation systems
    - Measuring text similarity

    Requires a Mistral API key.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| input | `str` | The text to embed | `` |
| model | `enum` | The embedding model to use | `mistral-embed` |
| chunk_size | `int` | Size of text chunks for embedding | `4096` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list` |  |

## Related Nodes

Browse other nodes in the [mistral.embeddings](../) namespace.
