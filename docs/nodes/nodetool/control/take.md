---
layout: page
title: "Take"
node_type: "nodetool.control.Take"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.Take`

**Namespace:** `nodetool.control`

## Description

Pass through the first N items of a stream and stop.
    take, head, limit, first, stream, slice, sample, truncate

    Use cases:
    - Test a pipeline on a small subset of inputs
    - Cap expensive downstream work at N items
    - Implement "first N matches" semantics over a stream

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| input_item | `any` | Streaming input — each item is forwarded until the limit is reached. | null |
| n | `int` | Number of items to take from the head of the stream. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |
| index | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](../) namespace.
