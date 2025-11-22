---
layout: page
title: "Remove Overlap"
node_type: "vector.chroma.RemoveOverlap"
namespace: "vector.chroma"
---

**Type:** `vector.chroma.RemoveOverlap`

**Namespace:** `vector.chroma`

## Description

Removes overlapping words between consecutive strings in a list. Splits text into words and matches word sequences for more accurate overlap detection.
    vector, RAG, query, text, processing, overlap, deduplication

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| documents | `any` | List of strings to process for overlap removal | `[]` |
| min_overlap_words | `any` | Minimum number of words that must overlap to be considered | `2` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| documents | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [vector.chroma](../) namespace.

