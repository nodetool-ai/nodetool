---
layout: page
title: "Summarization"
node_type: "transformers.Summarization"
namespace: "transformers"
---

**Type:** `transformers.Summarization`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | The text to summarize. | `` |
| model | `any` | Transformers.js model (ONNX-compatible). | - |
| max_length | `int` | Maximum number of tokens in the generated summary. | `130` |
| min_length | `int` | Minimum number of tokens in the generated summary. | `30` |
| do_sample | `bool` | Sample tokens instead of greedy decoding. | `false` |
| dtype | `enum` | Model dtype / quantization level. | `auto` |
| device | `enum` | Inference device. | `auto` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| summary | `str` |  |

## Related Nodes

Browse other nodes in the [transformers](./) namespace.
