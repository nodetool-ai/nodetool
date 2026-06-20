---
layout: page
title: "Repeat Value"
node_type: "nodetool.control.RepeatValue"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.RepeatValue`

**Namespace:** `nodetool.control`

## Description

Emit the same value N times without building a list first.
    repeat, loop, duplicate, scalar, batch, stream

    Use cases:
    - Run downstream steps N times with a wired prompt or parameter
    - Repeat one image ref, text, or dict through a pipeline
    - Pair with Collect to gather N results

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| value | `any` | Single value to emit on each tick. | null |
| count | `int` | Number of times to emit the value (0 emits nothing). | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |
| index | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](./) namespace.
