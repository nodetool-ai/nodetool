---
layout: page
title: "Repeat Count"
node_type: "nodetool.control.RepeatCount"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.RepeatCount`

**Namespace:** `nodetool.control`

## Description

Emit N sequential ticks without needing an input list.
    repeat, loop, count, times, iterate, batch

    Use cases:
    - Run the same downstream step N times (e.g. generate N images from one prompt)
    - Drive iteration by count instead of building a range list
    - Pair with Collect to gather N results

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| count | `int` | Number of ticks to emit (0 emits nothing). | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `int` |  |
| index | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](./) namespace.
