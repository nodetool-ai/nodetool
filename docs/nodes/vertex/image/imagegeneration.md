---
layout: page
title: "ImageGeneration"
node_type: "vertex.image.ImageGeneration"
namespace: "vertex.image"
---

**Type:** `vertex.image.ImageGeneration`

**Namespace:** `vertex.image`

## Description

Generate or edit an image with Gemini image models or Imagen on Vertex AI, billed to your Google Cloud project.
    {...}, image, generation, nano banana, imagen

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` | The text prompt describing the image to generate. | `` |
| image | `image` | The image to use as a base for the generation. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| aspect_ratio | `enum` | The aspect ratio of the generated image | `1:1` |
| resolution | `enum` | The output image resolution | `1K` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [vertex.image](./) namespace.
