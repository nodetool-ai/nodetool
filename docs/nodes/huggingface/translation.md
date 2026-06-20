---
layout: page
title: "Translation"
node_type: "huggingface.Translation"
namespace: "huggingface"
---

**Type:** `huggingface.Translation`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Translation model repo id (e.g. facebook/nllb-200-distilled-600M, Helsinki-NLP/opus-mt-en-fr). | `facebook/nllb-200-distilled-600M` |
| inputs | `str` | The text to translate. | `` |
| src_lang | `str` | Optional source language code for multilingual models (e.g. eng_Latn). | `` |
| tgt_lang | `str` | Optional target language code for multilingual models (e.g. fra_Latn). | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.
