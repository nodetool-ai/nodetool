---
layout: page
title: "Load Text To Image Model"
node_type: "huggingface.text_to_image.LoadTextToImageModel"
namespace: "huggingface.text_to_image"
---

**Type:** `huggingface.text_to_image.LoadTextToImageModel`

**Namespace:** `huggingface.text_to_image`

## Description

Load HuggingFace model for image-to-image generation from a repo_id.

    Use cases:
    - Loads a pipeline directly from a repo_id
    - Used for AutoPipelineForImage2Image

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| repo_id | `any` | The repository ID of the model to use for image-to-image generation. | `` |
| variant | `any` | The variant of the model to use for text-to-image generation. | `fp16` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_image](../) namespace.

