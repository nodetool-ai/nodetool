---
layout: page
title: "Audio Classification"
node_type: "huggingface.AudioClassification"
namespace: "huggingface"
---

**Type:** `huggingface.AudioClassification`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Audio-classification model repo id. | `superb/hubert-base-superb-er` |
| audio | `audio` | The audio to classify. | - |
| top_k | `int` | Return the top K most probable classes. | `5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |
| scores | `list` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.
