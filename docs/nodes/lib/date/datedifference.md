---
layout: page
title: "Date Difference"
node_type: "lib.date.DateDifference"
namespace: "lib.date"
---

**Type:** `lib.date.DateDifference`

**Namespace:** `lib.date`

## Description

Calculate the difference between two dates.
    datetime, difference, duration

    Use cases:
    - Calculate time periods
    - Measure durations

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| start_date | `any` | Start datetime | `{'type': 'datetime', 'year': 0, 'month': 0, 'day': 0, 'hour': 0, 'minute': 0, 'second': 0, 'microsecond': 0, 'tzinfo': 'UTC', 'utc_offset': 0}` |
| end_date | `any` | End datetime | `{'type': 'datetime', 'year': 0, 'month': 0, 'day': 0, 'hour': 0, 'minute': 0, 'second': 0, 'microsecond': 0, 'tzinfo': 'UTC', 'utc_offset': 0}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| total_seconds | `any` |  |
| days | `any` |  |
| hours | `any` |  |
| minutes | `any` |  |
| seconds | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.date](../) namespace.

