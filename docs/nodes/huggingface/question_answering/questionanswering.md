---
layout: page
title: "Question Answering"
node_type: "huggingface.question_answering.QuestionAnswering"
namespace: "huggingface.question_answering"
---

**Type:** `huggingface.question_answering.QuestionAnswering`

**Namespace:** `huggingface.question_answering`

## Description

Answers questions based on a given context.
    text, question answering, natural language processing

    Use cases:
    - Automated customer support
    - Information retrieval from documents
    - Reading comprehension tasks
    - Enhancing search functionality

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model ID to use for question answering | `{'type': 'hf.question_answering', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| context | `any` | The context or passage to answer questions from | `` |
| question | `any` | The question to be answered based on the context | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| answer | `any` |  |
| score | `any` |  |
| start | `any` |  |
| end | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.question_answering](../) namespace.

