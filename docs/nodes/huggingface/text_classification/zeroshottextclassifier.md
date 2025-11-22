---
layout: page
title: "Zero Shot Text Classifier"
node_type: "huggingface.text_classification.ZeroShotTextClassifier"
namespace: "huggingface.text_classification"
---

**Type:** `huggingface.text_classification.ZeroShotTextClassifier`

**Namespace:** `huggingface.text_classification`

## Description

Performs zero-shot classification on text.
    text, classification, zero-shot, natural language processing

    Use cases:
    - Classify text into custom categories without training
    - Topic detection in documents
    - Sentiment analysis with custom sentiment labels
    - Intent classification in conversational AI

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model ID to use for zero-shot classification | `{'type': 'hf.zero_shot_classification', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| inputs | `any` | The text to classify | `` |
| candidate_labels | `any` | Comma-separated list of candidate labels for classification | `` |
| multi_label | `any` | Whether to perform multi-label classification | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_classification](../) namespace.

