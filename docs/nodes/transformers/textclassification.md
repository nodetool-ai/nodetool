---
layout: page
title: "Text Classification"
node_type: "transformers.TextClassification"
namespace: "transformers"
---

**Type:** `transformers.TextClassification`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | The text to classify. | `I love this product!` |
| model | `any` | Transformers.js model (ONNX-compatible). | - |
| top_k | `int` | Number of top labels to return (1 returns the best label). | `1` |
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
