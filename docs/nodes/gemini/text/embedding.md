---
layout: page
title: "Embedding"
node_type: "gemini.text.Embedding"
namespace: "gemini.text"
---

**Type:** `gemini.text.Embedding`

**Namespace:** `gemini.text`

## Description

Generate vector representations of text for semantic analysis using Google's Gemini API.
    embeddings, similarity, search, clustering, classification, gemini

    Uses Google's text embedding models to create dense vector representations of text.
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
| input | `str` | The text to embed. | `` |
| model | `enum` | The embedding model to use | `text-embedding-004` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list` |  |

## Related Nodes

Browse other nodes in the [gemini.text](../) namespace.
