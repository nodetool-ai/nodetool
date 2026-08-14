---
layout: page
title: "Drop While"
node_type: "nodetool.control.DropWhile"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.DropWhile`

**Namespace:** `nodetool.control`

## Description

Drop items while a predicate is truthy, then pass everything after.
    drop, skip, while, predicate, stream, suffix

    Use cases:
    - Skip leading whitespace, headers, or warm-up
    - Wait for a stream to enter a steady state
    - Predicate-based version of Drop(N)

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| input_item | `any` | Streaming input. | null |
| predicate | `str` | Safe expression evaluated per item (comparisons, boolean logic, arithmetic, property access on `item`). Items are dropped until the predicate first returns falsy; everything after is passed through. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](./) namespace.
