---
layout: page
title: "Image Classification"
node_type: "transformers.ImageClassification"
namespace: "transformers"
---

**Type:** `transformers.ImageClassification`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | Image to classify. | `{"type":"image"}` |
| model | `any` | Transformers.js model (ONNX-compatible). | - |
| top_k | `int` | Number of top labels to return. | `5` |
| dtype | `enum` | Model dtype / quantization level. | `auto` |
| device | `enum` | Inference device. | `auto` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| label | `str` |  |
| score | `float` |  |
| results | `list` |  |

## Related Nodes

Browse other nodes in the [transformers](./) namespace.
