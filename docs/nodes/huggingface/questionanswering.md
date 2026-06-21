---
layout: page
title: "Question Answering"
node_type: "huggingface.QuestionAnswering"
namespace: "huggingface"
---

**Type:** `huggingface.QuestionAnswering`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Question-answering model repo id. | `deepset/roberta-base-squad2` |
| question | `str` | The question to answer. | `` |
| context | `str` | The passage that contains the answer. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |
| score | `float` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.
