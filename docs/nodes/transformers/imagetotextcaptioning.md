---
layout: page
title: "Image to Text (Captioning)"
node_type: "transformers.ImageToText"
namespace: "transformers"
---

**Type:** `transformers.ImageToText`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | Image to caption. | `{"type":"image"}` |
| model | `any` | Transformers.js model (ONNX-compatible). | - |
| max_new_tokens | `int` | Maximum number of tokens in the caption. | `50` |
| dtype | `enum` | Model dtype / quantization level. | `auto` |
| device | `enum` | Inference device. | `auto` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |

## Related Nodes

Browse other nodes in the [transformers](./) namespace.
