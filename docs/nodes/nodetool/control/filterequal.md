---
layout: page
title: "Filter Equal"
node_type: "nodetool.control.FilterEqual"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.FilterEqual`

**Namespace:** `nodetool.control`

## Description

Pass items through only when they equal a target value.
    filter, equal, match, predicate, stream, where

    Use cases:
    - Keep only items matching a status, label, or category
    - Drop sentinel/null markers from a stream
    - Select rows by an exact id

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| input_item | `any` | Streaming input — items pass through if they equal the target value. | null |
| value | `any` | Target value. Items deep-equal to this are passed through. | null |
| invert | `bool` | When true, pass items NOT equal to the target value. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](../) namespace.
