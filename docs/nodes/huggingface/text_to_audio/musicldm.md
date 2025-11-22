---
layout: page
title: "Music LDM"
node_type: "huggingface.text_to_audio.MusicLDM"
namespace: "huggingface.text_to_audio"
---

**Type:** `huggingface.text_to_audio.MusicLDM`

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
| model | `hf.text_to_audio` | The model ID to use for the audio generation | `{'type': 'hf.text_to_audio', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `str` | The input text to the model | `` |
| num_inference_steps | `int` | The number of inference steps to use for the generation | `10` |
| audio_length_in_s | `float` | The length of the generated audio in seconds | `5.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_audio](../) namespace.

