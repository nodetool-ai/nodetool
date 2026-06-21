---
layout: page
title: "Relight Image"
node_type: "nodetool.image.Relight"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.Relight`

**Namespace:** `nodetool.image`

## Description

Re-light a subject according to a text prompt using any supported relighting provider.
    image, relight, lighting, AI

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `image_model` | The relighting model to use | `{"type":"image_model","provider":"fal_ai","id":...` |
| image | `image` | Input image to relight | `{"type":"image","uri":"","asset_id":null,"data"...` |
| prompt | `str` | Description of the desired lighting | `studio lighting from the left` |
| negative_prompt | `str` | Text prompt describing what to avoid | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](./) namespace.
