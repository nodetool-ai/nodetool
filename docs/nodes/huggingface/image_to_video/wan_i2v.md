---
layout: page
title: "Wan (Image-to-Video)"
node_type: "huggingface.image_to_video.Wan_I2V"
namespace: "huggingface.image_to_video"
---

**Type:** `huggingface.image_to_video.Wan_I2V`

**Namespace:** `huggingface.image_to_video`

## Description

Generates a video from an input image using Wan image-to-video pipelines.
    video, generation, AI, image-to-video, diffusion, Wan

    Use cases:
    - Turn a single image into a dynamic clip with prompt guidance
    - Choose between Wan 2.2 A14B, Wan 2.1 14B 480P, and Wan 2.1 14B 720P models

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| input_image | `image` | The input image to generate the video from. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| prompt | `str` | A text prompt describing the desired video. | `An astronaut walking on the moon, cinematic lighting, high detail` |
| model_variant | `Enum['Wan-AI/Wan2.2-I2V-A14B-Diffusers', 'Wan-AI/Wan2.1-I2V-14B-480P-Diffusers', 'Wan-AI/Wan2.1-I2V-14B-720P-Diffusers']` | Select the Wan I2V model to use. | `Wan-AI/Wan2.2-I2V-A14B-Diffusers` |
| negative_prompt | `str` | A text prompt describing what to avoid in the video. | `` |
| num_frames | `int` | The number of frames in the video. | `81` |
| guidance_scale | `float` | The scale for classifier-free guidance. | `5.0` |
| num_inference_steps | `int` | The number of denoising steps. | `50` |
| height | `int` | The height of the generated video in pixels. | `480` |
| width | `int` | The width of the generated video in pixels. | `832` |
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

Browse other nodes in the [huggingface.image_to_video](../) namespace.

