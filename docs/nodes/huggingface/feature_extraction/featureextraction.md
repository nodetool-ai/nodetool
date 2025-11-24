---
layout: page
title: "Feature Extraction"
node_type: "huggingface.feature_extraction.FeatureExtraction"
namespace: "huggingface.feature_extraction"
---

**Type:** `huggingface.feature_extraction.FeatureExtraction`

**Namespace:** `huggingface.feature_extraction`

## Description

Extracts features from text using pre-trained models.
    text, feature extraction, embeddings, natural language processing

    Use cases:
    - Text similarity comparison
    - Clustering text documents
    - Input for machine learning models
    - Semantic search applications

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.feature_extraction` | The model ID to use for feature extraction | `{'type': 'hf.feature_extraction', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| inputs | `str` | The text to extract features from | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `np_array` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.feature_extraction](../) namespace.

