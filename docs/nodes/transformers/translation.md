---
layout: page
title: "Translation"
node_type: "transformers.Translation"
namespace: "transformers"
---

**Type:** `transformers.Translation`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | Source text to translate. | `Hello, how are you?` |
| model | `any` | Transformers.js model (ONNX-compatible). | - |
| src_lang | `str` | Source language code understood by the model (e.g. NLLB BCP-47 codes). | `eng_Latn` |
| tgt_lang | `str` | Target language code understood by the model. | `fra_Latn` |
| max_length | `int` | Maximum number of tokens in the translation. | `256` |
| dtype | `enum` | Model dtype / quantization level. | `auto` |
| device | `enum` | Inference device. | `auto` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| translation | `str` |  |

## Related Nodes

Browse other nodes in the [transformers](./) namespace.
