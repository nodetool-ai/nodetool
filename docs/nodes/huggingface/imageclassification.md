---
layout: page
title: "Image Classification"
node_type: "huggingface.ImageClassification"
namespace: "huggingface"
---

**Type:** `huggingface.ImageClassification`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Image-classification model repo id. | `google/vit-base-patch16-224` |
| image | `image` | The image to classify. | - |
| top_k | `int` | Return the top K most probable classes. | `5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |
| scores | `list` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.
