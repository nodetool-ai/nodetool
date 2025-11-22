---
layout: page
title: "Reranker"
node_type: "huggingface.ranking.Reranker"
namespace: "huggingface.ranking"
---

**Type:** `huggingface.ranking.Reranker`

**Namespace:** `huggingface.ranking`

## Description

Reranks pairs of text based on their semantic similarity.
    text, ranking, reranking, natural language processing

    Use cases:
    - Improve search results ranking
    - Question-answer pair scoring
    - Document relevance ranking

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model ID to use for reranking | `{'type': 'hf.reranker', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| query | `any` | The query text to compare against candidates | `` |
| candidates | `any` | List of candidate texts to rank | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.ranking](../) namespace.

