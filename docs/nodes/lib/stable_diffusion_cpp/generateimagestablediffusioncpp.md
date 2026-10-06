---
layout: page
title: "Generate Image (stable-diffusion.cpp)"
node_type: "lib.stable_diffusion_cpp.GenerateImage"
namespace: "lib.stable_diffusion_cpp"
---

**Type:** `lib.stable_diffusion_cpp.GenerateImage`

**Namespace:** `lib.stable_diffusion_cpp`

## Description

Generate images with a running stable-diffusion.cpp sd-server. Supports text-to-image, image-to-image, masks and reference images.
    sdcpp, local, diffusion, gguf, image

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| endpoint | `str` | Address of sd-server. The model is loaded by the server. | `http://127.0.0.1:1234` |
| prompt | `str` |  | `` |
| negative_prompt | `str` |  | `` |
| width | `int` |  | `512` |
| height | `int` |  | `512` |
| steps | `int` |  | `20` |
| cfg_scale | `float` |  | `7` |
| seed | `int` | Use -1 for a random seed. | `-1` |
| count | `int` |  | `1` |
| sampler | `str` | Native sample_method name. Empty uses the server default. | `` |
| scheduler | `str` | Native scheduler name. Empty uses the server default. | `` |
| image | `image` |  | null |
| mask | `image` | Optional mask for image-to-image generation. | null |
| reference_images | `list[image]` |  | `[]` |
| strength | `float` |  | `0.75` |
| parameters | `dict[str, any]` | Native img_gen fields such as lora, hires and vae_tiling_params. These override generation controls, including sample_params. Connected media takes precedence. | `{}` |
| timeout | `int` | Maximum seconds for submission and generation. Requests cancellation on timeout; sd-server can cancel queued jobs but cannot interrupt active generation. | `600` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |
| images | `list[image]` |  |

## Related Nodes

Browse other nodes in the [lib.stable_diffusion_cpp](./) namespace.
