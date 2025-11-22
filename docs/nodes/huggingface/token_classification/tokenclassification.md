---
layout: page
title: "Token Classification"
node_type: "huggingface.token_classification.TokenClassification"
namespace: "huggingface.token_classification"
---

**Type:** `huggingface.token_classification.TokenClassification`

**Namespace:** `huggingface.token_classification`

## Description

Performs token classification tasks such as Named Entity Recognition (NER).
    text, token classification, named entity recognition, natural language processing

    Use cases:
    - Named Entity Recognition in text
    - Part-of-speech tagging
    - Chunking and shallow parsing
    - Information extraction from unstructured text

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model ID to use for token classification | `{'type': 'hf.token_classification', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| inputs | `any` | The input text for token classification | `` |
| aggregation_strategy | `any` | Strategy to aggregate tokens into entities | `simple` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.token_classification](../) namespace.

