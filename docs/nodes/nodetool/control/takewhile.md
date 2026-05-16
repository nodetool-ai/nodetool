---
layout: page
title: "Take While"
node_type: "nodetool.control.TakeWhile"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.TakeWhile`

**Namespace:** `nodetool.control`

## Description

Pass items through while a predicate is truthy. Stops at the first failure.
    take, while, predicate, stream, prefix

    Use cases:
    - Stream until a sentinel/terminator is reached
    - Process items while a confidence threshold holds
    - Cleaner than counting when N is unknown up front

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| input_item | `any` | Streaming input. | null |
| predicate | `str` | JavaScript expression evaluated per item. The current value is bound to `item`. Stream stops at the first item where the predicate is falsy. | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](../) namespace.
