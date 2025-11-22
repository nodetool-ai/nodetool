---
layout: page
title: "Audio LDM 2"
node_type: "huggingface.text_to_audio.AudioLDM2"
namespace: "huggingface.text_to_audio"
---

**Type:** `huggingface.text_to_audio.AudioLDM2`

**Namespace:** `huggingface.text_to_audio`

## Description

Generates audio using the AudioLDM2 model based on text prompts.
    audio, generation, AI, text-to-audio

    Use cases:
    - Create custom sound effects based on textual descriptions
    - Generate background audio for videos or games
    - Produce audio content for multimedia projects
    - Explore AI-generated audio for creative sound design

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `any` | A text prompt describing the desired audio. | `The sound of a hammer hitting a wooden surface.` |
| negative_prompt | `any` | A text prompt describing what you don't want in the audio. | `Low quality.` |
| num_inference_steps | `any` | Number of denoising steps. More steps generally improve quality but increase generation time. | `200` |
| audio_length_in_s | `any` | The desired duration of the generated audio in seconds. | `10.0` |
| num_waveforms_per_prompt | `any` | Number of audio samples to generate per prompt. | `3` |
| seed | `any` | Seed for the random number generator. Use -1 for a random seed. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_audio](../) namespace.

