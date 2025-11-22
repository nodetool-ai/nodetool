---
layout: page
title: "Get Weekday"
node_type: "lib.date.GetWeekday"
namespace: "lib.date"
---

**Type:** `lib.date.GetWeekday`

**Namespace:** `lib.date`

## Description

Get the weekday name or number from a datetime.
    datetime, weekday, name

    Use cases:
    - Get day names for scheduling
    - Filter events by weekday

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| input_datetime | `any` | Input datetime | `{'type': 'datetime', 'year': 0, 'month': 0, 'day': 0, 'hour': 0, 'minute': 0, 'second': 0, 'microsecond': 0, 'tzinfo': 'UTC', 'utc_offset': 0}` |
| as_name | `any` | Return weekday name instead of number (0-6) | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.date](../) namespace.

