---
layout: page
title: "Image Classifier"
node_type: "huggingface.image_classification.ImageClassifier"
namespace: "huggingface.image_classification"
---

**Type:** `huggingface.image_classification.ImageClassifier`

**Namespace:** `huggingface.image_classification`

## Description

Classifies images into predefined categories.
    image, classification, labeling, categorization

    Use cases:
    - Content moderation by detecting inappropriate images
    - Organizing photo libraries by automatically tagging images

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.image_classification` | The model ID to use for the classification | `{'type': 'hf.image_classification', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| image | `image` | The input image to classify | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[str, float]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_classification](../) namespace.

