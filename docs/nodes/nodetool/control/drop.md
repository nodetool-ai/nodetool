---
layout: page
title: "Drop"
node_type: "nodetool.control.Drop"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.Drop`

**Namespace:** `nodetool.control`

## Description

Skip the first N items of a stream, pass the rest through.
    drop, skip, head, stream, slice, offset

    Use cases:
    - Skip headers or warm-up items in a stream
    - Pagination-style offsets
    - Drop the first record from a CSV-like feed

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| input_item | `any` | Streaming input — items after the first N are forwarded. | null |
| n | `int` | Number of items to drop from the head of the stream. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |
| index | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](../) namespace.
