---
layout: page
title: "Repeat Each"
node_type: "nodetool.list.RepeatEach"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.RepeatEach`

**Namespace:** `nodetool.list`

## Description

Repeat each list item consecutively N times.
    list, repeat, duplicate, interleave, expand

    Use cases:
    - Generate multiple variants per input item
    - [A, B, C] × 2 → [A, A, B, B, C, C]
    - Feed expanded lists into For Each

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| input_list | `list[any]` | List whose items are repeated individually. | `[]` |
| times | `int` | How many times to repeat each item. | `1` |
| max_output_length | `int` | Maximum number of items in the output list. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[any]` |  |

## Related Nodes

Browse other nodes in the [nodetool.list](./) namespace.
