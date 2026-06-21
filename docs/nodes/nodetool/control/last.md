---
layout: page
title: "Last"
node_type: "nodetool.control.Last"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.Last`

**Namespace:** `nodetool.control`

## Description

Emit only the final item of a stream.
    last, final, tail, fold, stream, reduce

    Use cases:
    - Keep the final answer from an agent token stream
    - Pick the most recent item in a feed
    - Cheap fold to a single value

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| input_item | `any` | Streaming input — only the final value is forwarded. | null |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](./) namespace.
