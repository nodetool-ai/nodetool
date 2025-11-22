---
layout: page
title: "Render Text"
node_type: "lib.pillow.draw.RenderText"
namespace: "lib.pillow.draw"
---

**Type:** `lib.pillow.draw.RenderText`

**Namespace:** `lib.pillow.draw`

## Description

This node allows you to add text to images.
    text, font, label, title, watermark, caption, image, overlay
    This node takes text, font updates, coordinates (where to place the text), and an image to work with. A user can use the Render Text Node to add a label or title to an image, watermark an image, or place a caption directly on an image.

    The Render Text Node offers customizable options, including the ability to choose the text's font, size, color, and alignment (left, center, or right). Text placement can also be defined, providing flexibility to place the text wherever you see fit.

    #### Applications
    - Labeling images in a image gallery or database.
    - Watermarking images for copyright protection.
    - Adding custom captions to photographs.
    - Creating instructional images to guide the reader's view.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `any` | The text to render. | `` |
| font | `any` | The font to use. | `{'type': 'font', 'name': 'DejaVuSans'}` |
| x | `any` | The x coordinate. | `0` |
| y | `any` | The y coordinate. | `0` |
| size | `any` | The font size. | `12` |
| color | `any` | The font color. | `{'type': 'color', 'value': '#000000'}` |
| align | `any` |  | `left` |
| image | `any` | The image to render on. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pillow.draw](../) namespace.

