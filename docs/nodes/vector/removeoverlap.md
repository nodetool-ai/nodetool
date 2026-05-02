---
layout: page
title: "Remove Overlap"
node_type: "vector.RemoveOverlap"
namespace: "vector"
---

**Type:** `vector.RemoveOverlap`

**Namespace:** `vector`

## Description

Removes overlapping words between consecutive strings in a list. Splits text into words and matches word sequences for more accurate overlap detection.
    vector, RAG, query, text, processing, overlap, deduplication

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| documents | `list[str]` | List of strings to process for overlap removal | `[]` |
| min_overlap_words | `int` | Minimum number of words that must overlap to be considered | `2` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| documents | `list[str]` |  |

## Related Nodes

Browse other nodes in the [vector](../) namespace.
