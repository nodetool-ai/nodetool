---
layout: page
title: "Date Range"
node_type: "lib.date.DateRange"
namespace: "lib.date"
---

**Type:** `lib.date.DateRange`

**Namespace:** `lib.date`

## Description

Generate a list of dates between start and end dates.
    datetime, range, list

    Use cases:
    - Generate date sequences
    - Create date-based iterations

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| start_date | `any` | Start date of the range | `{'type': 'datetime', 'year': 0, 'month': 0, 'day': 0, 'hour': 0, 'minute': 0, 'second': 0, 'microsecond': 0, 'tzinfo': 'UTC', 'utc_offset': 0}` |
| end_date | `any` | End date of the range | `{'type': 'datetime', 'year': 0, 'month': 0, 'day': 0, 'hour': 0, 'minute': 0, 'second': 0, 'microsecond': 0, 'tzinfo': 'UTC', 'utc_offset': 0}` |
| step_days | `any` | Number of days between each date | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.date](../) namespace.

