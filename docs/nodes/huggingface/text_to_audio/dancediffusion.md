---
layout: page
title: "Dance Diffusion"
node_type: "huggingface.text_to_audio.DanceDiffusion"
namespace: "huggingface.text_to_audio"
---

**Type:** `huggingface.text_to_audio.DanceDiffusion`

**Namespace:** `huggingface.text_to_audio`

## Description

Generates audio using the DanceDiffusion model.
    audio, generation, AI, music, text-to-audio

    Use cases:
    - Create AI-generated music samples
    - Produce background music for videos or games
    - Generate audio content for creative projects
    - Explore AI-composed musical ideas

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| audio_length_in_s | `float` | The desired duration of the generated audio in seconds. | `4.0` |
| num_inference_steps | `int` | Number of denoising steps. More steps generally improve quality but increase generation time. | `50` |
| seed | `int` | Seed for the random number generator. Use -1 for a random seed. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_audio](../) namespace.

