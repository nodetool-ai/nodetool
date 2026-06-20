---
layout: page
title: "Painter"
node_type: "nodetool.image.Painter"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.Painter`

**Namespace:** `nodetool.image`

## Description

Paint an alpha mask on top of an image and output the mask.
    image, painter, mask, brush, paint

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | Source image painted on (passed through to output). | `{"type":"image","uri":"","asset_id":null,"data"...` |
| mask_data | `str` | Base64-encoded PNG of the painted alpha mask. Managed by the UI. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| mask | `image` |  |
| image | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](./) namespace.
