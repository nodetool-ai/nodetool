---
layout: page
title: "Text Classifier"
node_type: "huggingface.text_classification.TextClassifier"
namespace: "huggingface.text_classification"
---

**Type:** `huggingface.text_classification.TextClassifier`

**Namespace:** `huggingface.text_classification`

## Description

Classifies text into predefined categories using a Hugging Face model.
    text, classification, zero-shot, natural language processing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.text_classification` | The model ID to use for the classification | `{'type': 'hf.text_classification', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `str` | The input text to the model | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[str, float]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_classification](../) namespace.

