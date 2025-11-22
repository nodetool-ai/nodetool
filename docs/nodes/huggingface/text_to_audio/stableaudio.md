---
layout: page
title: "Stable Audio"
node_type: "huggingface.text_to_audio.StableAudio"
namespace: "huggingface.text_to_audio"
---

**Type:** `huggingface.text_to_audio.StableAudio`

**Namespace:** `huggingface.text_to_audio`

## Description

Generate audio using Stable Audio model based on text prompts. Features high-quality audio synthesis with configurable parameters.
    audio, generation, synthesis, text-to-audio, text-to-audio

    Use cases:
    - Create custom audio content from text
    - Generate background music and sounds
    - Produce audio for multimedia projects
    - Create sound effects and ambience
    - Generate experimental audio content

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `str` | A text prompt describing the desired audio. | `A peaceful piano melody.` |
| negative_prompt | `str` | A text prompt describing what you don't want in the audio. | `Low quality.` |
| duration | `float` | The desired duration of the generated audio in seconds. | `10.0` |
| num_inference_steps | `int` | Number of denoising steps. More steps generally improve quality but increase generation time. | `200` |
| seed | `int` | Seed for the random number generator. Use -1 for a random seed. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_audio](../) namespace.

