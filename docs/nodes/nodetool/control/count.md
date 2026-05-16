---
layout: page
title: "Count"
node_type: "nodetool.control.Count"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.Count`

**Namespace:** `nodetool.control`

## Description

Emit the total number of items when the stream ends.
    count, length, size, total, fold, stream

    Use cases:
    - Report how many items a pipeline produced
    - Measure stream throughput without buffering items
    - Avoid collecting just to call .length

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| input_item | `any` | Streaming input — items are counted but not forwarded. | null |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](../) namespace.
