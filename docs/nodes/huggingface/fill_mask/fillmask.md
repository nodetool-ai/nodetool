---
layout: page
title: "Fill Mask"
node_type: "huggingface.fill_mask.FillMask"
namespace: "huggingface.fill_mask"
---

**Type:** `huggingface.fill_mask.FillMask`

**Namespace:** `huggingface.fill_mask`

## Description

Fills in a masked token in a given text.
    text, fill-mask, natural language processing

    Use cases:
    - Text completion
    - Sentence prediction
    - Language understanding tasks
    - Generating text options

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.fill_mask` | The model ID to use for fill-mask task | `{'type': 'hf.fill_mask', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| inputs | `str` | The input text with [MASK] token to be filled | `The capital of France is [MASK].` |
| top_k | `int` | Number of top predictions to return | `5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[str, any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.fill_mask](../) namespace.

