---
layout: page
title: "MiniMax Text to Video"
node_type: "minimax.TextToVideo"
namespace: "minimax"
---

**Type:** `minimax.TextToVideo`

**Namespace:** `minimax`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `enum` | The MiniMax video model to use. | `MiniMax-Hailuo-02` |
| prompt | `str` |  | `A cat playing with a ball of yarn` |
| duration | `int` | Video duration in seconds. | `6` |
| resolution | `enum` | Output resolution. | `768P` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [minimax](./) namespace.
