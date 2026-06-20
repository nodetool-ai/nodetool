---
layout: page
title: "Zero-Shot Classification"
node_type: "transformers.ZeroShotClassification"
namespace: "transformers"
---

**Type:** `transformers.ZeroShotClassification`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | Text to classify. | `I have a problem with my iphone that needs to b...` |
| candidate_labels | `str` | Comma-separated list of candidate labels. | `urgent, not urgent, phone, tablet, computer` |
| multi_label | `bool` | Allow multiple labels to be true simultaneously. | `false` |
| model | `any` | Transformers.js model (ONNX-compatible). | - |
| hypothesis_template | `str` | Template used to construct the entailment hypothesis. | `This example is {}.` |
| dtype | `enum` | Model dtype / quantization level. | `auto` |
| device | `enum` | Inference device. | `auto` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| label | `str` |  |
| score | `float` |  |
| labels | `list` |  |
| scores | `list` |  |

## Related Nodes

Browse other nodes in the [transformers](./) namespace.
