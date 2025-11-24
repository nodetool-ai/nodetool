---
layout: page
title: "Image Generation"
node_type: "gemini.image.ImageGeneration"
namespace: "gemini.image"
---

**Type:** `gemini.image.ImageGeneration`

**Namespace:** `gemini.image`

## Description

Generate an image using Google's Imagen model via the Gemini API.
    google, image generation, ai, imagen

    Use cases:
    - Create images from text descriptions
    - Generate assets for creative projects
    - Explore AI-powered image synthesis

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `str` | The text prompt describing the image to generate. | `` |
| model | `Enum['gemini-2.0-flash-preview-image-generation', 'gemini-2.5-flash-image-preview', 'imagen-3.0-generate-001', 'imagen-3.0-generate-002', 'imagen-4.0-generate-preview-06-06', 'imagen-4.0-ultra-generate-preview-06-06']` | The image generation model to use | `imagen-3.0-generate-002` |
| image | `image` | The image to use as a base for the generation. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [gemini.image](../) namespace.

