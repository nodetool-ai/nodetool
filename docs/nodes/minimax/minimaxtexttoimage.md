---
layout: page
title: "MiniMax Text to Image"
node_type: "minimax.TextToImage"
namespace: "minimax"
---

**Type:** `minimax.TextToImage`

**Namespace:** `minimax`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | The MiniMax image model to use. | `image-01` |
| prompt | `str` | Text prompt describing the desired image. | `A cat holding a sign that says hello world` |
| negative_prompt | `str` | Describe what to avoid in the image. | `` |
| aspect_ratio | `enum` | Aspect ratio of the generated image. | `1:1` |
| prompt_optimizer | `bool` | Let MiniMax automatically refine the prompt before generating. | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [minimax](./) namespace.
