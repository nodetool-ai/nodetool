---
layout: page
title: "Remove Background"
node_type: "nodetool.image.RemoveBackground"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.RemoveBackground`

**Namespace:** `nodetool.image`

## Description

Remove the background from an image, returning a cutout with transparency.
    image, background, remove, matte, cutout, AI

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `image_model` | The background-removal model to use | `{"type":"image_model","provider":"fal_ai","id":...` |
| image | `image` | Input image to remove the background from | `{"type":"image","uri":"","asset_id":null,"data"...` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](./) namespace.
