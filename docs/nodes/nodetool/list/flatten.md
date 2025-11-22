---
layout: page
title: "Flatten"
node_type: "nodetool.list.Flatten"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.Flatten`

**Namespace:** `nodetool.list`

## Description

Flattens a nested list structure into a single flat list.
    list, flatten, nested, structure

    Use cases:
    - Convert nested lists into a single flat list
    - Simplify complex list structures
    - Process hierarchical data as a sequence

    Examples:
    [[1, 2], [3, 4]] -> [1, 2, 3, 4]
    [[1, [2, 3]], [4, [5, 6]]] -> [1, 2, 3, 4, 5, 6]

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `List[any]` |  | `[]` |
| max_depth | `int` |  | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.list](../) namespace.

