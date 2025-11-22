---
layout: page
title: "Slice"
node_type: "nodetool.list.Slice"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.Slice`

**Namespace:** `nodetool.list`

## Description

Extracts a subset from a list using start, stop, and step indices.
    list, slice, subset, extract

    Use cases:
    - Get a portion of a list
    - Implement pagination
    - Extract every nth element

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `List[any]` |  | `[]` |
| start | `int` |  | `0` |
| stop | `int` |  | `0` |
| step | `int` |  | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.list](../) namespace.

