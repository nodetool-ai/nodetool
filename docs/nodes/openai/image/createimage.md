---
layout: page
title: "Create Image"
node_type: "openai.image.CreateImage"
namespace: "openai.image"
---

**Type:** `openai.image.CreateImage`

**Namespace:** `openai.image`

## Description

Generates images from textual descriptions.
    image, t2i, tti, text-to-image, create, generate, picture, photo, art, drawing, illustration

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` | The prompt to use. | `` |
| model | `enum` | The model to use for image generation. | `gpt-image-1` |
| size | `enum` | The size of the image to generate. | `1024x1024` |
| background | `enum` | The background of the image to generate. | `auto` |
| quality | `enum` | The quality of the image to generate. | `high` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [openai.image](../) namespace.
