---
layout: page
title: "Tokenize"
node_type: "lib.nlp.Tokenize"
namespace: "lib.nlp"
---

**Type:** `lib.nlp.Tokenize`

**Namespace:** `lib.nlp`

## Description

Tokenizes text into words or sentences.
    tokenize, split, words, sentences, NLP

    Use cases:
    - Break text into individual words for analysis
    - Split text into sentences for processing
    - Prepare text for further NLP operations
    - Count words or sentences in text

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | The text to tokenize | `` |
| mode | `enum` | Tokenization mode: split into words or sentences | `word` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list` |  |
| count | `int` |  |

## Related Nodes

Browse other nodes in the [lib.nlp](../) namespace.
