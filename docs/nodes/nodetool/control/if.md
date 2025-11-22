---
layout: page
title: "If"
node_type: "nodetool.control.If"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.If`

**Namespace:** `nodetool.control`

## Description

Conditionally executes one of two branches based on a condition.
    control, flow, condition, logic, else, true, false, switch, toggle, flow-control

    Use cases:
    - Branch workflow based on conditions
    - Handle different cases in data processing
    - Implement decision logic

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| condition | `bool` | The condition to evaluate | `False` |
| value | `any` | The value to pass to the next node | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| if_true | `any` |  |
| if_false | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.control](../) namespace.

