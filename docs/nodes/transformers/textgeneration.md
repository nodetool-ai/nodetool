---
layout: page
title: "Text Generation"
node_type: "transformers.TextGeneration"
namespace: "transformers"
---

**Type:** `transformers.TextGeneration`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` | Prompt for the language model. | `Once upon a time` |
| model | `any` | Transformers.js model (ONNX-compatible). | - |
| max_new_tokens | `int` | Maximum number of tokens to generate after the prompt. | `128` |
| temperature | `float` | Sampling temperature (1.0 = neutral). | `1` |
| top_p | `float` | Nucleus sampling probability mass (1.0 = disabled). | `1` |
| top_k | `int` | Limit sampling to the K most likely tokens. | `50` |
| do_sample | `bool` | Sample tokens instead of greedy decoding. | `true` |
| repetition_penalty | `float` | Penalty applied to repeated tokens (>1 discourages repetition). | `1` |
| dtype | `enum` | Model dtype / quantization level. | `auto` |
| device | `enum` | Inference device. | `auto` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |

## Related Nodes

Browse other nodes in the [transformers](./) namespace.
