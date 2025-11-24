---
layout: page
title: "Transform"
node_type: "nodetool.list.Transform"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.Transform`

**Namespace:** `nodetool.list`

## Description

Applies a transformation to each element in a list.
    list, transform, map, convert

    Use cases:
    - Convert types (str to int, etc.)
    - Apply formatting
    - Mathematical operations

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `List[any]` |  | `[]` |
| transform_type | `Enum['to_int', 'to_float', 'to_string', 'uppercase', 'lowercase', 'strip']` |  | `to_string` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.list](../) namespace.

