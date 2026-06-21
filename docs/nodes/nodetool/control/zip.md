---
layout: page
title: "Zip"
node_type: "nodetool.control.Zip"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.Zip`

**Namespace:** `nodetool.control`

## Description

Pair items from two independent iteration sources by matched index within the common parent.
    zip, pair, combine, merge, join, index, stream, iterate

    Use cases:
    - Combine matching items from two parallel streams
    - Pair inputs and outputs by position
    - Merge two iteration sources into tuples

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| left | `any` | Left iteration source. | null |
| right | `any` | Right iteration source. | null |
| max_unmatched_pairs | `int` | Maximum number of unmatched items to buffer before failing. §7. | `1024` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| left | `any` |  |
| right | `any` |  |
| index | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](./) namespace.
