---
layout: page
title: "Table Question Answering"
node_type: "huggingface.question_answering.TableQuestionAnswering"
namespace: "huggingface.question_answering"
---

**Type:** `huggingface.question_answering.TableQuestionAnswering`

**Namespace:** `huggingface.question_answering`

## Description

Answers questions based on tabular data.
    table, question answering, natural language processing

    Use cases:
    - Querying databases using natural language
    - Analyzing spreadsheet data with questions
    - Extracting insights from tabular reports
    - Automated data exploration

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.table_question_answering` | The model ID to use for table question answering | `{'type': 'hf.table_question_answering', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| dataframe | `dataframe` | The input table to query | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| question | `str` | The question to be answered based on the table | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| answer | `str` |  |
| coordinates | `List[Tuple[int, int]]` |  |
| cells | `List[str]` |  |
| aggregator | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.question_answering](../) namespace.

