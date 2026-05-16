---
layout: page
title: "Filter (Code)"
node_type: "nodetool.control.FilterCode"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.FilterCode`

**Namespace:** `nodetool.control`

## Description

Pass items through when a JavaScript predicate returns truthy.
    filter, predicate, code, javascript, expression, stream, where

    Use cases:
    - Keep items matching arbitrary criteria (e.g. item.score > 0.5)
    - Drop empty or malformed records
    - Custom field-based filtering

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| input_item | `any` | Streaming input — each item is tested against the predicate. | null |
| predicate | `str` | JavaScript expression evaluated per item. The current value is bound to `item`. Examples: `item > 0`, `item.score > 0.5`, `typeof item === 'string'`. | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](../) namespace.
