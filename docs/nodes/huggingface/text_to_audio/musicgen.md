---
layout: page
title: "Music Gen"
node_type: "huggingface.text_to_audio.MusicGen"
namespace: "huggingface.text_to_audio"
---

**Type:** `huggingface.text_to_audio.MusicGen`

**Namespace:** `huggingface.text_to_audio`

## Description

Generates audio (music or sound effects) from text descriptions.
    audio, music, generation, huggingface, text-to-audio

    Use cases:
    - Create custom background music for videos or games
    - Generate sound effects based on textual descriptions
    - Prototype musical ideas quickly

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model ID to use for the audio generation | `{'type': 'hf.text_to_audio', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `any` | The input text to the model | `` |
| max_new_tokens | `any` | The maximum number of tokens to generate | `1024` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_audio](../) namespace.

