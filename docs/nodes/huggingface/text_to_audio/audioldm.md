---
layout: page
title: "Audio LDM"
node_type: "huggingface.text_to_audio.AudioLDM"
namespace: "huggingface.text_to_audio"
---

**Type:** `huggingface.text_to_audio.AudioLDM`

**Namespace:** `huggingface.text_to_audio`

## Description

Generates audio using the AudioLDM model based on text prompts.
    audio, generation, AI, text-to-audio

    Use cases:
    - Create custom music or sound effects from text descriptions
    - Generate background audio for videos, games, or other media
    - Produce audio content for creative projects
    - Explore AI-generated audio for music production or sound design

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `any` | A text prompt describing the desired audio. | `Techno music with a strong, upbeat tempo and high melodic riffs` |
| num_inference_steps | `any` | Number of denoising steps. More steps generally improve quality but increase generation time. | `10` |
| audio_length_in_s | `any` | The desired duration of the generated audio in seconds. | `5.0` |
| seed | `any` | Seed for the random number generator. Use -1 for a random seed. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_audio](../) namespace.

