---
layout: page
title: "Wan (Text-to-Video)"
node_type: "huggingface.text_to_video.Wan_T2V"
namespace: "huggingface.text_to_video"
---

**Type:** `huggingface.text_to_video.Wan_T2V`

**Namespace:** `huggingface.text_to_video`

## Description

Generates videos from text prompts using Wan text-to-video pipeline.
    video, generation, AI, text-to-video, diffusion, Wan

    Use cases:
    - Create high-quality videos from text descriptions
    - Efficient 1.3B model for consumer GPUs or 14B for maximum quality

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `str` | A text prompt describing the desired video. | `A robot standing on a mountain top at sunset, cinematic lighting, high detail` |
| model_variant | `Enum['Wan-AI/Wan2.2-T2V-A14B-Diffusers', 'Wan-AI/Wan2.1-T2V-14B-Diffusers', 'Wan-AI/Wan2.2-TI2V-5B-Diffusers']` | Select the Wan model to use. | `Wan-AI/Wan2.2-T2V-A14B-Diffusers` |
| negative_prompt | `str` | A text prompt describing what to avoid in the video. | `` |
| num_frames | `int` | The number of frames in the video. | `49` |
| guidance_scale | `float` | The scale for classifier-free guidance. | `5.0` |
| num_inference_steps | `int` | The number of denoising steps. | `30` |
| height | `int` | The height of the generated video in pixels. | `480` |
| width | `int` | The width of the generated video in pixels. | `720` |
| fps | `int` | Frames per second for the output video. | `16` |
| seed | `int` | Seed for the random number generator. Use -1 for a random seed. | `-1` |
| max_sequence_length | `int` | Maximum sequence length in encoded prompt. | `512` |
| enable_cpu_offload | `bool` | Enable CPU offload to reduce VRAM usage. | `True` |
| enable_vae_slicing | `bool` | Enable VAE slicing to reduce VRAM usage. | `True` |
| enable_vae_tiling | `bool` | Enable VAE tiling to reduce VRAM usage for large videos. | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_video](../) namespace.

