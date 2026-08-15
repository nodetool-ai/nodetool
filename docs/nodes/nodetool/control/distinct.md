---
layout: page
title: "Distinct"
node_type: "nodetool.control.Distinct"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.Distinct`

**Namespace:** `nodetool.control`

## Description

Drop duplicate items from a stream. Optional key expression for grouping.
    distinct, unique, dedup, deduplicate, stream, set

    Use cases:
    - Deduplicate URLs, ids, or records
    - Keep only the first sighting of each value
    - Field-based dedup with a key expression

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| input_item | `any` | Streaming input — duplicate items are dropped. | null |
| key | `str` | Optional safe expression for the dedup key (property access on `item`, plus comparisons, boolean logic, and arithmetic). Examples: `item.id`, `item.url`. Empty means use the whole item. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](./) namespace.
