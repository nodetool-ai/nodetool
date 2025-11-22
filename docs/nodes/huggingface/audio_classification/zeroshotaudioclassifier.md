---
layout: page
title: "Zero Shot Audio Classifier"
node_type: "huggingface.audio_classification.ZeroShotAudioClassifier"
namespace: "huggingface.audio_classification"
---

**Type:** `huggingface.audio_classification.ZeroShotAudioClassifier`

**Namespace:** `huggingface.audio_classification`

## Description

Classifies audio into categories without the need for training data.
    audio, classification, labeling, categorization, zero-shot

    Use cases:
    - Quickly categorize audio without training data
    - Identify sounds or music genres without predefined labels
    - Automate audio tagging for large datasets

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model ID to use for the classification | `{'type': 'hf.zero_shot_audio_classification', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| audio | `any` | The input audio to classify | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| candidate_labels | `any` | The candidate labels to classify the audio against, separated by commas | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.audio_classification](../) namespace.

