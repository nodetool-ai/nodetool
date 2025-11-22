---
layout: page
title: "Map Field"
node_type: "nodetool.list.MapField"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.MapField`

**Namespace:** `nodetool.list`

## Description

Extracts a specific field from a list of dictionaries.
    list, map, field, extract, pluck

    Use cases:
    - Extract specific fields from a list of dictionaries
    - Transform complex data structures into simple lists
    - Collect values for a particular key across multiple dictionaries

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `List[Dict[str, any]]` |  | `[]` |
| field | `str` |  | `` |
| default | `Optional[any]` |  | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.list](../) namespace.

