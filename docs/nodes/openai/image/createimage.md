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

    Use cases:
    1. Create custom illustrations for articles or presentations
    2. Generate concept art for creative projects
    3. Produce visual aids for educational content
    4. Design unique marketing visuals or product mockups
    5. Explore artistic ideas and styles programmatically

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `any` | The prompt to use. | `` |
| model | `any` | The model to use for image generation. | `gpt-image-1` |
| size | `any` | The size of the image to generate. | `1024x1024` |
| background | `any` | The background of the image to generate. | `auto` |
| quality | `any` | The quality of the image to generate. | `high` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [openai.image](../) namespace.

