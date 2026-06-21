---
layout: page
title: "Table Question Answering"
node_type: "huggingface.TableQuestionAnswering"
namespace: "huggingface"
---

**Type:** `huggingface.TableQuestionAnswering`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Table-question-answering model repo id. | `google/tapas-base-finetuned-wtq` |
| question | `str` | The question to ask about the table. | `` |
| table | `dict` | The table as an object mapping each column name to an array of string cell values. | `{}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |
| cells | `list` |  |
| aggregator | `str` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.
