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
| prompt | `any` | The text prompt describing the image to generate. | `` |
| model | `any` | The image generation model to use | `imagen-3.0-generate-002` |
| image | `any` | The image to use as a base for the generation. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [gemini.image](../) namespace.

