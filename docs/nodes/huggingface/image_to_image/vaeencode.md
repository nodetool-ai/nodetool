---
layout: page
title: "VAE Encode"
node_type: "huggingface.image_to_image.VAEEncode"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.VAEEncode`

**Namespace:** `huggingface.image_to_image`

## Description

Encodes an image into latents using a VAE.
    image -> tensor (TorchTensor)

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.vae` | The VAE model to use. | `{'type': 'hf.vae', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| image | `image` | Input image to encode. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| scale_factor | `float` | Scaling factor applied to latents (e.g., 0.18215 for SD15) | `0.18215` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `torch_tensor` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

