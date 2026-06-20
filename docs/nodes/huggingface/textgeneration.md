---
layout: page
title: "Text Generation"
node_type: "huggingface.TextGeneration"
namespace: "huggingface"
---

**Type:** `huggingface.TextGeneration`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Text-generation model repo id. | `HuggingFaceH4/zephyr-7b-beta` |
| prompt | `str` | The text prompt to continue. | `Once upon a time` |
| max_new_tokens | `int` | Maximum number of new tokens to generate. | `256` |
| temperature | `float` | Sampling temperature. | `0.7` |
| return_full_text | `bool` | Include the prompt in the returned text. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.
