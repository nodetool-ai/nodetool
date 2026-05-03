---
layout: page
title: "Stem"
node_type: "lib.nlp.Stem"
namespace: "lib.nlp"
---

**Type:** `lib.nlp.Stem`

**Namespace:** `lib.nlp`

## Description

Stems words to their root form.
    stem, root, morphology, NLP, text processing

    Use cases:
    - Reduce words to their base form for matching
    - Normalize text for search indexing
    - Prepare text for comparison and deduplication
    - Improve text similarity matching

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | The text containing words to stem | `` |
| algorithm | `enum` | Stemming algorithm to use | `porter` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |
| tokens | `list` |  |

## Related Nodes

Browse other nodes in the [lib.nlp](../) namespace.
