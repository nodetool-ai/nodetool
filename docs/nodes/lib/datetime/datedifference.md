---
layout: page
title: "Date Difference"
node_type: "lib.datetime.Diff"
namespace: "lib.datetime"
---

**Type:** `lib.datetime.Diff`

**Namespace:** `lib.datetime`

## Description

Difference between two dates (date_a − date_b) expressed in the given unit.
    date, diff, difference, between, duration

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| date_a | `any` |  | `` |
| date_b | `any` |  | `` |
| unit | `enum` | Unit for the returned diff. | `day` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| diff | `int` |  |
| is_before | `bool` |  |
| is_after | `bool` |  |
| is_same | `bool` |  |

## Related Nodes

Browse other nodes in the [lib.datetime](../) namespace.
