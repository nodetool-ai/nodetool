---
layout: page
title: "Edit Image"
node_type: "openai.image.EditImage"
namespace: "openai.image"
---

**Type:** `openai.image.EditImage`

**Namespace:** `openai.image`

## Description

Edit images using OpenAI's gpt-image-1 model.
    image, edit, modify, transform, inpaint, outpaint, variation

    Takes an input image and a text prompt to generate a modified version.
    Can be used for inpainting, outpainting, style transfer, and image modification.
    Optionally accepts a mask to specify which areas to edit.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The image to edit. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| mask | `image` | Optional mask image. White areas will be edited, black areas preserved. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| prompt | `str` | The prompt describing the desired edit. | `` |
| model | `enum` | The model to use for image editing. | `gpt-image-1` |
| size | `enum` | The size of the output image. | `1024x1024` |
| quality | `enum` | The quality of the generated image. | `high` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [openai.image](../) namespace.
