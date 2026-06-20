---
layout: page
title: "Chunk"
node_type: "nodetool.control.Chunk"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.Chunk`

**Namespace:** `nodetool.control`

## Description

Group every N items into a list and emit as a batch. Trailing partial batch is emitted at end of stream.
    chunk, batch, group, window, buffer, stream

    Use cases:
    - Batched LLM/API calls without giving up streaming
    - Window-based aggregation
    - Group rows for bulk inserts

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| input_item | `any` | Streaming input — items are buffered into batches of size N. | null |
| size | `int` | Number of items per batch. | `10` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[any]` |  |
| index | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](./) namespace.
