---
layout: page
title: "Tile List"
node_type: "nodetool.list.Tile"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.Tile`

**Namespace:** `nodetool.list`

## Description

Repeat an entire list end-to-end N times.
    list, repeat, tile, cycle, loop, concatenate

    Use cases:
    - Run the same item sequence multiple times before For Each
    - Duplicate a prompt list for batch generation
    - [A, B, C] × 3 → [A, B, C, A, B, C, A, B, C]

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| input_list | `list[any]` | List to repeat. | `[]` |
| times | `int` | How many times to repeat the full list. | `1` |
| max_output_length | `int` | Maximum number of items in the output list. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[any]` |  |

## Related Nodes

Browse other nodes in the [nodetool.list](./) namespace.
