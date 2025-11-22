---
layout: page
title: "VAE Decode"
node_type: "huggingface.image_to_image.VAEDecode"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.VAEDecode`

**Namespace:** `huggingface.image_to_image`

## Description

Decodes latents into an image using a VAE.
    tensor (TorchTensor) -> image

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.vae` | The VAE model to use. | `{'type': 'hf.vae', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| latents | `torch_tensor` | Latent tensor to decode. | `{'type': 'torch_tensor', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| scale_factor | `float` | Scaling factor used for encoding (inverse is applied before decode) | `0.18215` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

