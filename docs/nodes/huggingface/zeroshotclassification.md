---
layout: page
title: "Zero Shot Classification"
node_type: "huggingface.ZeroShotClassification"
namespace: "huggingface"
---

**Type:** `huggingface.ZeroShotClassification`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Zero-shot-classification model repo id. | `facebook/bart-large-mnli` |
| inputs | `str` | The text to classify. | `` |
| candidate_labels | `str` | Comma-separated list of candidate labels. | `` |
| multi_label | `bool` | Allow multiple labels to be true at once. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |
| scores | `list` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.
