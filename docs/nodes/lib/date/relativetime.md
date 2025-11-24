---
layout: page
title: "Relative Time"
node_type: "lib.date.RelativeTime"
namespace: "lib.date"
---

**Type:** `lib.date.RelativeTime`

**Namespace:** `lib.date`

## Description

Get datetime relative to current time (past or future).
    datetime, past, future, relative, hours, days, months

    Use cases:
    - Calculate past or future dates
    - Generate relative timestamps

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| amount | `int` | Amount of time units | `1` |
| unit | `Enum['hours', 'days', 'months']` | Time unit type | `days` |
| direction | `Enum['past', 'future']` | Past or future | `future` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `datetime` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.date](../) namespace.

