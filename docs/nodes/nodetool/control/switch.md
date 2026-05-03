---
layout: page
title: "Switch"
node_type: "nodetool.control.Switch"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.Switch`

**Namespace:** `nodetool.control`

## Description

Multi-branch routing: match a value against cases and route to the matching output.
    control, switch, match, case, branch, route, multi-branch, flow-control

    Use cases:
    - Route data based on string/number matching
    - Implement multi-way branching logic
    - Replace chains of If nodes

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| value | `any` | The value to match against cases. | `` |
| cases | `list[any]` | List of values to match against. The first match wins. | `[]` |
| input | `any` | The data to route to the matched output. | null |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| matched | `any` |  |
| default | `any` |  |
| index | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](../) namespace.
