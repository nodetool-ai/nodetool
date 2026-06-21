---
layout: page
title: "Range"
node_type: "nodetool.list.Range"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.Range`

**Namespace:** `nodetool.list`

## Description

Build a list of integers like Python range(start, stop, step).
    list, range, sequence, numbers, index, enumerate

    Use cases:
    - Generate [0, 1, ..., N-1] for iteration with For Each
    - Produce numbered indices for batch naming or sequencing
    - Create arithmetic sequences with custom start, stop, and step

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| start | `int` | First value (inclusive). | `0` |
| stop | `int` | Exclusive end. When -1 (default), uses Count instead to produce [0, 1, ..., count-1]. | `-1` |
| count | `int` | Used when Stop is -1. Produces [0, 1, ..., count-1]. | `10` |
| step | `int` | Increment between values. | `1` |
| max_output_length | `int` | Maximum number of integers to produce. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[int]` |  |

## Related Nodes

Browse other nodes in the [nodetool.list](./) namespace.
