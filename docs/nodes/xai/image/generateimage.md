---
layout: page
title: "Generate Image"
node_type: "xai.image.GenerateImage"
namespace: "xai.image"
---

**Type:** `xai.image.GenerateImage`

**Namespace:** `xai.image`

## Description

Generate images from text using xAI's Grok image models.
    xai, grok, image, t2i, text-to-image, create, generate, picture, art

    Uses xAI's OpenAI-compatible image generations endpoint. The model
    automatically revises the prompt; the revised prompt is returned as a
    second output. Requires an xAI API key.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` | The prompt describing the image to generate. | `` |
| model | `str` | The Grok image model to use (e.g. grok-2-image, grok-imagine-image). | `grok-2-image` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |
| revised_prompt | `str` |  |

## Related Nodes

Browse other nodes in the [xai.image](./) namespace.
