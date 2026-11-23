---
layout: page
title: "Rerank"
node_type: "nodetool.text.Rerank"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.Rerank`

**Namespace:** `nodetool.text`

## Description

Sort documents by how relevant they are to a query, using a reranking model.
    rerank, retrieval, search, relevance, RAG, cross-encoder

    Use cases:
    - Reorder vector search results before they reach an LLM
    - Keep the best few passages for a question
    - Score candidate answers against a query

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `rerank_model` | The reranking model to use | `{"type":"rerank_model","provider":"transformers...` |
| query | `str` | The question or search text to rank against | `` |
| documents | `list[str]` | The texts to rank | `[]` |
| top_k | `int` | Keep only the best this many documents. 0 keeps all. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| documents | `list[str]` |  |
| scores | `list[float]` |  |
| indices | `list[int]` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](./) namespace.
