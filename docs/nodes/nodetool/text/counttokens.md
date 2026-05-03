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

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` |  | `` |
| encoding | `enum` | The tiktoken encoding to use for token counting | `cl100k_base` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
