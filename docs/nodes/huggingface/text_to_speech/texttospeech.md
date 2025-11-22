---
layout: page
title: "Text To Speech"
node_type: "huggingface.text_to_speech.TextToSpeech"
namespace: "huggingface.text_to_speech"
---

**Type:** `huggingface.text_to_speech.TextToSpeech`

**Namespace:** `huggingface.text_to_speech`

## Description

A generic Text-to-Speech node that can work with various Hugging Face TTS models.
    tts, audio, speech, huggingface, speak, voice

    Use cases:
    - Generate speech from text for various applications
    - Create voice content for apps, websites, or virtual assistants
    - Produce audio narrations for videos, presentations, or e-learning content

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model ID to use for text-to-speech generation | `{'type': 'hf.text_to_speech', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| text | `any` | The text to convert to speech | `Hello, this is a test of the text-to-speech system.` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_speech](../) namespace.

