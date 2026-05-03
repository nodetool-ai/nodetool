---
layout: page
title: "Add / Subtract Time"
node_type: "lib.datetime.Add"
namespace: "lib.datetime"
---

**Type:** `lib.datetime.Add`

**Namespace:** `lib.datetime`

## Description

Add (or subtract, when amount is negative) a number of time units to a date.
    date, add, subtract, shift, offset

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| date | `any` | Input date. | `` |
| amount | `int` | Amount to add (use negative to subtract). | `0` |
| unit | `enum` | Unit of time. | `day` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| iso | `str` |  |
| epoch_ms | `int` |  |
| date | `datetime` |  |

## Related Nodes

Browse other nodes in the [lib.datetime](../) namespace.
