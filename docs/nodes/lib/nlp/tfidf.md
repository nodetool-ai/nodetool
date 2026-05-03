---
layout: page
title: "TF-IDF"
node_type: "lib.nlp.TfIdf"
namespace: "lib.nlp"
---

**Type:** `lib.nlp.TfIdf`

**Namespace:** `lib.nlp`

## Description

Computes TF-IDF scores for terms across multiple documents.
    tf-idf, term frequency, document frequency, text analysis, NLP

    Use cases:
    - Rank document relevance for a search query
    - Identify important terms in a collection of documents
    - Build keyword extraction pipelines
    - Compare document similarity by term importance

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| documents | `list` | List of text strings to compute TF-IDF across | `[]` |
| query | `str` | Term to compute TF-IDF for | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list` |  |

## Related Nodes

Browse other nodes in the [lib.nlp](../) namespace.
