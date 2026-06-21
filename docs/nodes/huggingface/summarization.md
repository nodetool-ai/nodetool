---
layout: page
title: "Summarization"
node_type: "huggingface.Summarization"
namespace: "huggingface"
---

**Type:** `huggingface.Summarization`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Summarization model repo id. | `facebook/bart-large-cnn` |
| inputs | `str` | The text to summarize. | `` |
| max_length | `int` | Maximum length of the summary in tokens (0 = model default). | `0` |
| min_length | `int` | Minimum length of the summary in tokens (0 = model default). | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.
