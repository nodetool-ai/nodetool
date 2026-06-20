---
layout: page
title: "Fill Mask"
node_type: "huggingface.FillMask"
namespace: "huggingface"
---

**Type:** `huggingface.FillMask`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Fill-mask model repo id. | `bert-base-uncased` |
| inputs | `str` | Text containing a mask token (e.g. [MASK] for BERT, <mask> for RoBERTa). | `The capital of France is [MASK].` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |
| predictions | `list` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.
