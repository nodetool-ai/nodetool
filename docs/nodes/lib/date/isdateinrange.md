---
layout: page
title: "Is Date In Range"
node_type: "lib.date.IsDateInRange"
namespace: "lib.date"
---

**Type:** `lib.date.IsDateInRange`

**Namespace:** `lib.date`

## Description

Check if a date falls within a specified range.
    datetime, range, check

    Use cases:
    - Validate date ranges
    - Filter date-based data

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| check_date | `any` | Date to check | `{'type': 'datetime', 'year': 0, 'month': 0, 'day': 0, 'hour': 0, 'minute': 0, 'second': 0, 'microsecond': 0, 'tzinfo': 'UTC', 'utc_offset': 0}` |
| start_date | `any` | Start of date range | `{'type': 'datetime', 'year': 0, 'month': 0, 'day': 0, 'hour': 0, 'minute': 0, 'second': 0, 'microsecond': 0, 'tzinfo': 'UTC', 'utc_offset': 0}` |
| end_date | `any` | End of date range | `{'type': 'datetime', 'year': 0, 'month': 0, 'day': 0, 'hour': 0, 'minute': 0, 'second': 0, 'microsecond': 0, 'tzinfo': 'UTC', 'utc_offset': 0}` |
| inclusive | `any` | Include start and end dates in range | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.date](../) namespace.

