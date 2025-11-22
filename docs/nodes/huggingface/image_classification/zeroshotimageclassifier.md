---
layout: page
title: "Zero-Shot Image Classifier"
node_type: "huggingface.image_classification.ZeroShotImageClassifier"
namespace: "huggingface.image_classification"
---

**Type:** `huggingface.image_classification.ZeroShotImageClassifier`

**Namespace:** `huggingface.image_classification`

## Description

Classifies images into categories without the need for training data.
    image, classification, labeling, categorization

    Use cases:
    - Quickly categorize images without training data
    - Identify objects in images without predefined labels
    - Automate image tagging for large datasets

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.zero_shot_image_classification` | The model ID to use for the classification | `{'type': 'hf.zero_shot_image_classification', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| image | `image` | The input image to classify | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| candidate_labels | `str` | The candidate labels to classify the image against, separated by commas | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[str, float]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_classification](../) namespace.

