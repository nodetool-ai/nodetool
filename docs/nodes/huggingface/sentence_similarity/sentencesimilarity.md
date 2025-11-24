---
layout: page
title: "Sentence Similarity"
node_type: "huggingface.sentence_similarity.SentenceSimilarity"
namespace: "huggingface.sentence_similarity"
---

**Type:** `huggingface.sentence_similarity.SentenceSimilarity`

**Namespace:** `huggingface.sentence_similarity`

## Description

Compares the similarity between two sentences.
    text, sentence similarity, embeddings, natural language processing

    Use cases:
    - Duplicate detection in text data
    - Semantic search
    - Sentiment analysis

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.sentence_similarity` | The model ID to use for sentence similarity | `{'type': 'hf.sentence_similarity', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| inputs | `str` | The text to compare | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `np_array` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.sentence_similarity](../) namespace.

