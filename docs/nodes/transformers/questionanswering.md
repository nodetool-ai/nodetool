---
layout: page
title: "Question Answering"
node_type: "transformers.QuestionAnswering"
namespace: "transformers"
---

**Type:** `transformers.QuestionAnswering`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| question | `str` | The question to answer. | `What is the capital of France?` |
| context | `str` | The passage that contains the answer. | `Paris is the capital and most populous city of ...` |
| model | `any` | Transformers.js model (ONNX-compatible). | - |
| top_k | `int` | Number of candidate answers to return. | `1` |
| dtype | `enum` | Model dtype / quantization level. | `auto` |
| device | `enum` | Inference device. | `auto` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| answer | `str` |  |
| score | `float` |  |
| start | `int` |  |
| end | `int` |  |
| results | `list` |  |

## Related Nodes

Browse other nodes in the [transformers](./) namespace.
