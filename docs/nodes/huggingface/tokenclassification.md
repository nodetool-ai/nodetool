---
layout: page
title: "Token Classification"
node_type: "huggingface.TokenClassification"
namespace: "huggingface"
---

**Type:** `huggingface.TokenClassification`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Token-classification / NER model repo id. | `dslim/bert-base-NER` |
| inputs | `str` | The text to analyze. | `` |
| aggregation_strategy | `enum` | How to group sub-word tokens into entities. | `simple` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.
