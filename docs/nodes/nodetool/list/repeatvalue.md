---
layout: page
title: "Repeat Value"
node_type: "nodetool.list.RepeatValue"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.RepeatValue`

**Namespace:** `nodetool.list`

## Description

Duplicate a single value into a list N times.
    list, repeat, duplicate, fill, scalar, constant

    Use cases:
    - Build [v, v, v] from one prompt or parameter before For Each
    - Expand a scalar into a list for list-typed inputs
    - v × 3 → [v, v, v]

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| value | `any` | Single value to repeat. | null |
| times | `int` | How many copies to produce. | `1` |
| max_output_length | `int` | Maximum number of items in the output list. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[any]` |  |

## Related Nodes

Browse other nodes in the [nodetool.list](./) namespace.
