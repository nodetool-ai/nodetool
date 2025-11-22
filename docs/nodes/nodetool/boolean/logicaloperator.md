---
layout: page
title: "Logical Operator"
node_type: "nodetool.boolean.LogicalOperator"
namespace: "nodetool.boolean"
---

**Type:** `nodetool.boolean.LogicalOperator`

**Namespace:** `nodetool.boolean`

## Description

Performs logical operations on two boolean inputs.
    boolean, logic, operator, condition, flow-control, branch, else, true, false, switch, toggle

    Use cases:
    - Combine multiple conditions in decision-making
    - Implement complex logical rules in workflows
    - Create advanced filters or triggers

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| a | `bool` | First boolean input | `False` |
| b | `bool` | Second boolean input | `False` |
| operation | `Enum['and', 'or', 'xor', 'nand', 'nor']` | Logical operation to perform | `and` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `bool` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.boolean](../) namespace.

