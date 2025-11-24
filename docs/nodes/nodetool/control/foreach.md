---
layout: page
title: "For Each"
node_type: "nodetool.control.ForEach"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.ForEach`

**Namespace:** `nodetool.control`

## Description

Iterate over a list and emit each item sequentially.
    iterator, loop, list, sequence

    Use cases:
    - Process each item of a collection in order
    - Drive downstream nodes with individual elements

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| input_list | `List[any]` | The list of items to iterate over. | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |
| index | `int` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.control](../) namespace.

