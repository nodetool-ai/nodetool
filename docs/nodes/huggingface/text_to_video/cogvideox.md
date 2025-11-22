---
layout: page
title: "CogVideoX"
node_type: "huggingface.text_to_video.CogVideoX"
namespace: "huggingface.text_to_video"
---

**Type:** `huggingface.text_to_video.CogVideoX`

**Namespace:** `huggingface.text_to_video`

## Description

Generates videos from text prompts using CogVideoX, a large diffusion transformer model.
    video, generation, AI, text-to-video, transformer, diffusion

    Use cases:
    - Create high-quality videos from text descriptions
    - Generate longer and more consistent videos
    - Produce cinematic content for creative projects
    - Create animated scenes for storytelling
    - Generate video content for marketing and media

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `str` | A text prompt describing the desired video. | `A detailed wooden toy ship with intricately carved masts and sails is seen gliding smoothly over a plush, blue carpet that mimics the waves of the sea. The ship's hull is painted a rich brown, with tiny windows. The carpet, soft and textured, provides a perfect backdrop, resembling an oceanic expanse. Surrounding the ship are various other toys and children's items, hinting at a playful environment. The scene captures the innocence and imagination of childhood, with the toy ship's journey symbolizing endless adventures in a whimsical, indoor setting.` |
| negative_prompt | `str` | A text prompt describing what to avoid in the video. | `` |
| num_frames | `int` | The number of frames in the video. Must be divisible by 8 + 1 (e.g., 49, 81, 113). | `49` |
| guidance_scale | `float` | The scale for classifier-free guidance. | `6.0` |
| num_inference_steps | `int` | The number of denoising steps. | `50` |
| height | `int` | The height of the generated video in pixels. | `480` |
| width | `int` | The width of the generated video in pixels. | `720` |
| fps | `int` | Frames per second for the output video. | `8` |
| seed | `int` | Seed for the random number generator. Use -1 for a random seed. | `-1` |
| max_sequence_length | `int` | Maximum sequence length in encoded prompt. | `226` |
| enable_cpu_offload | `bool` | Enable CPU offload to reduce VRAM usage. | `True` |
| enable_vae_slicing | `bool` | Enable VAE slicing to reduce VRAM usage. | `True` |
| enable_vae_tiling | `bool` | Enable VAE tiling to reduce VRAM usage for large videos. | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_video](../) namespace.

