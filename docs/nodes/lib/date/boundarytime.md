---
layout: page
title: "Boundary Time"
node_type: "lib.date.BoundaryTime"
namespace: "lib.date"
---

**Type:** `lib.date.BoundaryTime`

**Namespace:** `lib.date`

## Description

Get the start or end of a time period (day, week, month, year).
    datetime, start, end, boundary, day, week, month, year

    Use cases:
    - Get period boundaries for reporting
    - Normalize dates to period starts/ends

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| input_datetime | `any` | Input datetime | `{'type': 'datetime', 'year': 0, 'month': 0, 'day': 0, 'hour': 0, 'minute': 0, 'second': 0, 'microsecond': 0, 'tzinfo': 'UTC', 'utc_offset': 0}` |
| period | `any` | Time period type | `day` |
| boundary | `any` | Start or end of period | `start` |
| start_monday | `any` | For week period: Consider Monday as start of week (False for Sunday) | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.date](../) namespace.

