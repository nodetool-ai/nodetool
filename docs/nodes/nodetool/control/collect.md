---
layout: page
title: "Collect"
node_type: "nodetool.control.Collect"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.Collect`

**Namespace:** `nodetool.control`

## Description

Collect items until the end of the stream and return them as a list.
    collector, aggregate, list, stream

    Use cases:
    - Gather results from multiple processing steps
    - Collect streaming data into batches
    - Aggregate outputs from parallel operations

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| input_item | `any` | The input item to collect. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.control](../) namespace.

