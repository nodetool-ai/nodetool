---
layout: page
title: "Feature Extraction"
node_type: "huggingface.FeatureExtraction"
namespace: "huggingface"
---

**Type:** `huggingface.FeatureExtraction`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Feature-extraction / embedding model repo id. | `sentence-transformers/all-MiniLM-L6-v2` |
| inputs | `str` | The text to embed. | `` |
| normalize | `bool` | L2-normalize the returned embedding. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.
