---
layout: page
title: "Cross"
node_type: "nodetool.control.Cross"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.Cross`

**Namespace:** `nodetool.control`

## Description

Emit the cartesian product of two iteration sources within their common parent.
    cross, cartesian, product, combine, pairs, matrix, stream, iterate

    Use cases:
    - Generate every combination of two input sets
    - Build a grid of parameter combinations
    - Pair each item of one stream with all items of another

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| left | `any` | Left iteration source. | null |
| right | `any` | Right iteration source. | null |
| max_output_count | `int` | Maximum number of pairs to emit. Buffering both sides without a cap can blow memory. | `1024` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| left | `any` |  |
| right | `any` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](./) namespace.
