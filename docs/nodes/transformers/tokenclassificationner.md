---
layout: page
title: "Token Classification (NER)"
node_type: "transformers.TokenClassification"
namespace: "transformers"
---

**Type:** `transformers.TokenClassification`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | Text to extract entities from. | `My name is Sarah and I live in London.` |
| model | `any` | Transformers.js model (ONNX-compatible). | - |
| aggregation_strategy | `enum` | How to merge subword tokens into entity spans. | `simple` |
| dtype | `enum` | Model dtype / quantization level. | `auto` |
| device | `enum` | Inference device. | `auto` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| entities | `list` |  |

## Related Nodes

Browse other nodes in the [transformers](./) namespace.
