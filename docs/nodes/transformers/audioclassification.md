---
layout: page
title: "Audio Classification"
node_type: "transformers.AudioClassification"
namespace: "transformers"
---

**Type:** `transformers.AudioClassification`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | Audio clip to classify. | `{"type":"audio"}` |
| model | `any` | Transformers.js model (ONNX-compatible). | - |
| top_k | `int` | Number of top labels to return. | `5` |
| sampling_rate | `int` | Sampling rate (Hz) used when decoding the audio. | - |
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
