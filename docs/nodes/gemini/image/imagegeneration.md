---
layout: page
title: "Image Generation"
node_type: "gemini.image.ImageGeneration"
namespace: "gemini.image"
---

**Type:** `gemini.image.ImageGeneration`

**Namespace:** `gemini.image`

## Description

Generate an image using Google's native Gemini image model.
    google, image generation, ai, imagen

    Use cases:
    - Create images from text descriptions
    - Generate assets for creative projects
    - Explore AI-powered image synthesis

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` | The text prompt describing the image to generate. | `` |
| model | `enum` | The image generation model to use | `gemini-3.1-flash-image` |
| image | `image` | The image to use as a base for the generation. | `{"type":"image","uri":"","asset_id":null,"data"...` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [gemini.image](./) namespace.
