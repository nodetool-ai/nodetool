---
layout: page
title: "MiniMax Image to Video"
node_type: "minimax.ImageToVideo"
namespace: "minimax"
---

**Type:** `minimax.ImageToVideo`

**Namespace:** `minimax`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `enum` | The MiniMax video model to use. | `MiniMax-Hailuo-02` |
| image | `image` | The image to use as the first frame of the video. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| prompt | `str` |  | `` |
| duration | `int` | Video duration in seconds. | `6` |
| resolution | `enum` | Output resolution. | `768P` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [minimax](./) namespace.
