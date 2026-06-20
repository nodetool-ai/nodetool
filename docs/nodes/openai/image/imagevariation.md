---
layout: page
title: "Image Variation"
node_type: "openai.image.ImageVariation"
namespace: "openai.image"
---

**Type:** `openai.image.ImageVariation`

**Namespace:** `openai.image`

## Description

Generate variations of an input image using OpenAI's image variations API.
    image, variation, remix, generate, alternative, dall-e

    Takes a square PNG image and produces a new image that is a variation of it.
    No text prompt is used — the model riffs on the source image directly.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The source image to generate variations from (square PNG). | `{"type":"image","uri":"","asset_id":null,"data"...` |
| size | `enum` | The size of the generated image. | `1024x1024` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [openai.image](./) namespace.
