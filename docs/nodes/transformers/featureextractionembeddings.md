---
layout: page
title: "Feature Extraction (Embeddings)"
node_type: "transformers.FeatureExtraction"
namespace: "transformers"
---

**Type:** `transformers.FeatureExtraction`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | Text to embed. | `Hello world` |
| model | `any` | Transformers.js model (ONNX-compatible). | - |
| pooling | `enum` | Pooling strategy applied to the token embeddings. | `mean` |
| normalize | `bool` | L2-normalize the resulting embedding. | `true` |
| dtype | `enum` | Model dtype / quantization level. | `auto` |
| device | `enum` | Inference device. | `auto` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| embedding | `list` |  |
| dim | `int` |  |

## Related Nodes

Browse other nodes in the [transformers](./) namespace.
