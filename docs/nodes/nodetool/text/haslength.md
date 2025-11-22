---
layout: page
title: "Check Length"
node_type: "nodetool.text.HasLength"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.HasLength`

**Namespace:** `nodetool.text`

## Description

Checks if text length meets specified conditions.
    text, check, length, compare, validate, whitespace, string

    Use cases:
    - Validating input length requirements
    - Filtering text by length
    - Checking content size constraints

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `str` |  | `` |
| min_length | `Optional[int]` |  | - |
| max_length | `Optional[int]` |  | - |
| exact_length | `Optional[int]` |  | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `bool` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.

