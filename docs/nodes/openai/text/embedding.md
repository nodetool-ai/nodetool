---
layout: page
title: "Embedding"
node_type: "openai.text.Embedding"
namespace: "openai.text"
---

**Type:** `openai.text.Embedding`

**Namespace:** `openai.text`

## Description

Generate vector representations of text for semantic analysis.
    embeddings, similarity, search, clustering, classification

    Uses OpenAI's embedding models to create dense vector representations of text.
    These vectors capture semantic meaning, enabling:
    - Semantic search
    - Text clustering
    - Document classification
    - Recommendation systems
    - Anomaly detection
    - Measuring text similarity and diversity

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| input | `str` |  | `` |
| model | `Enum['text-embedding-3-large', 'text-embedding-3-small']` |  | `text-embedding-3-small` |
| chunk_size | `int` |  | `4096` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `np_array` |  |

## Metadata

## Related Nodes

Browse other nodes in the [openai.text](../) namespace.

