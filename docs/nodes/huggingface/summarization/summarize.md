---
layout: page
title: "Summarize"
node_type: "huggingface.summarization.Summarize"
namespace: "huggingface.summarization"
---

**Type:** `huggingface.summarization.Summarize`

**Namespace:** `huggingface.summarization`

## Description

Summarizes text using a Hugging Face model.
    text, summarization, AI, LLM

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model ID to use for the text generation | `{'type': 'hf.text_generation', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| inputs | `any` | The input text to summarize | `` |
| max_length | `any` | The maximum length of the generated text | `100` |
| do_sample | `any` | Whether to sample from the model | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.summarization](../) namespace.

