---
layout: page
title: "Zero-Shot Image Classification"
node_type: "transformers.ZeroShotImageClassification"
namespace: "transformers"
---

**Type:** `transformers.ZeroShotImageClassification`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | Image to classify. | `{"type":"image"}` |
| candidate_labels | `str` | Comma-separated list of candidate labels. | `a photo of a cat, a photo of a dog, a photo of ...` |
| model | `any` | Transformers.js model (ONNX-compatible). | - |
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
