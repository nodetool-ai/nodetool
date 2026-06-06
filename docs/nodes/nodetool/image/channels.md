---
layout: page
title: "Channels"
node_type: "nodetool.image.Channels"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.Channels`

**Namespace:** `nodetool.image`

## Description

Extract a single channel from an image as a grayscale preview.
    image, channel, red, green, blue, alpha, luminance

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The image to extract a channel from. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| channel | `str` | Which channel to extract. | `luminance` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.
