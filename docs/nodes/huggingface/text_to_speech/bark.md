---
layout: page
title: "Bark"
node_type: "huggingface.text_to_speech.Bark"
namespace: "huggingface.text_to_speech"
---

**Type:** `huggingface.text_to_speech.Bark`

**Namespace:** `huggingface.text_to_speech`

## Description

Bark is a text-to-audio model created by Suno. Bark can generate highly realistic, multilingual speech as well as other audio - including music, background noise and simple sound effects. The model can also produce nonverbal communications like laughing, sighing and crying.
    tts, audio, speech, huggingface

    Use cases:
    - Create voice content for apps and websites
    - Develop voice assistants with natural-sounding speech
    - Generate automated announcements for public spaces

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.text_to_speech` | The model ID to use for the image generation | `{'type': 'hf.text_to_speech', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `str` | The input text to the model | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_speech](../) namespace.

