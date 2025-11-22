---
layout: page
title: "Chunk"
node_type: "nodetool.list.Chunk"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.Chunk`

**Namespace:** `nodetool.list`

## Description

Splits a list into smaller chunks of specified size.
    list, chunk, split, group

    Use cases:
    - Batch processing
    - Pagination
    - Creating sublists of fixed size

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `List[any]` |  | `[]` |
| chunk_size | `int` |  | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[List[any]]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.list](../) namespace.

