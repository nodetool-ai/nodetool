---
layout: page
title: "Fill Mask"
node_type: "transformers.FillMask"
namespace: "transformers"
---

**Type:** `transformers.FillMask`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | Text containing a single mask token (e.g. [MASK] or <mask>). | `The quick brown [MASK] jumps over the lazy dog.` |
| model | `any` | Transformers.js model (ONNX-compatible). | - |
| top_k | `int` | Number of candidate fill-ins to return. | `5` |
| dtype | `enum` | Model dtype / quantization level. | `auto` |
| device | `enum` | Inference device. | `auto` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| top | `str` |  |
| results | `list` |  |

## Related Nodes

Browse other nodes in the [transformers](./) namespace.
