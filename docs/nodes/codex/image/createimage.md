---
layout: page
title: "Create Image"
node_type: "codex.image.CreateImage"
namespace: "codex.image"
---

**Type:** `codex.image.CreateImage`

**Namespace:** `codex.image`

## Description

Generate an image with GPT Image on your ChatGPT sign-in instead of an API key.
    codex, chatgpt, openai, image, generation, gpt-image, text-to-image

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` | What the image should show. | `` |
| size | `enum` | The image size in pixels, or auto. | `auto` |
| quality | `enum` | Rendering quality. Higher quality takes longer and uses more of your plan. | `auto` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [codex.image](./) namespace.
