---
layout: page
title: "Extract Entities"
node_type: "lib.nlp.ExtractEntities"
namespace: "lib.nlp"
---

**Type:** `lib.nlp.ExtractEntities`

**Namespace:** `lib.nlp`

## Description

Extracts named entities and parts of speech using compromise.
    NER, named entities, parts of speech, NLP, text analysis

    Use cases:
    - Extract people, places, and organizations from text
    - Identify nouns and verbs in sentences
    - Build knowledge graphs from unstructured text
    - Analyze text structure and content

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | The text to extract entities from | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| people | `list` |  |
| places | `list` |  |
| organizations | `list` |  |
| numbers | `list` |  |
| nouns | `list` |  |
| verbs | `list` |  |

## Related Nodes

Browse other nodes in the [lib.nlp](../) namespace.
