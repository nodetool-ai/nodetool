---
layout: page
title: "Embedding"
node_type: "nodetool.text.Embedding"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.Embedding`

**Namespace:** `nodetool.text`

## Description

Generate vector representations of text using any supported embedding provider.
    Automatically routes to the appropriate backend (OpenAI, Gemini, Mistral).
    embeddings, similarity, search, clustering, classification, vectors, semantic

    Uses embedding models to create dense vector representations of text.
    These vectors capture semantic meaning, enabling:
    - Semantic search
    - Text clustering
    - Document classification
    - Recommendation systems
    - Anomaly detection
    - Measuring text similarity and diversity

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `embedding_model` | The embedding model to use | `{"type":"embedding_model","provider":"openai","...` |
| input | `str` | The text to embed | `` |
| chunk_size | `int` | Size of text chunks for embedding (used when input exceeds model limits) | `4096` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
