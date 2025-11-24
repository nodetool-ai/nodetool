---
layout: page
title: "Count Tokens"
node_type: "nodetool.text.CountTokens"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.CountTokens`

**Namespace:** `nodetool.text`

## Description

Counts the number of tokens in text using tiktoken.
    text, tokens, count, encoding

    Use cases:
    - Checking text length for LLM input limits
    - Estimating API costs
    - Managing token budgets in text processing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `str` |  | `` |
| encoding | `Enum['cl100k_base', 'p50k_base', 'r50k_base']` | The tiktoken encoding to use for token counting | `cl100k_base` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `int` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.

