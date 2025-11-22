---
layout: page
title: "Audio Classifier"
node_type: "huggingface.audio_classification.AudioClassifier"
namespace: "huggingface.audio_classification"
---

**Type:** `huggingface.audio_classification.AudioClassifier`

**Namespace:** `huggingface.audio_classification`

## Description

Classifies audio into predefined categories.
    audio, classification, labeling, categorization

    Use cases:
    - Classify music genres
    - Detect speech vs. non-speech audio
    - Identify environmental sounds
    - Emotion recognition in speech

    Recommended models
    - MIT/ast-finetuned-audioset-10-10-0.4593
    - ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model ID to use for audio classification | `{'type': 'hf.audio_classification', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| audio | `any` | The input audio to classify | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| top_k | `any` | The number of top results to return | `10` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.audio_classification](../) namespace.

