---
layout: page
title: "Add Time Delta"
node_type: "lib.date.AddTimeDelta"
namespace: "lib.date"
---

**Type:** `lib.date.AddTimeDelta`

**Namespace:** `lib.date`

## Description

Add or subtract time from a datetime.
    datetime, add, subtract

    Use cases:
    - Calculate future/past dates
    - Generate date ranges

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| input_datetime | `any` | Starting datetime | `{'type': 'datetime', 'year': 0, 'month': 0, 'day': 0, 'hour': 0, 'minute': 0, 'second': 0, 'microsecond': 0, 'tzinfo': 'UTC', 'utc_offset': 0}` |
| days | `any` | Number of days to add (negative to subtract) | `0` |
| hours | `any` | Number of hours to add (negative to subtract) | `0` |
| minutes | `any` | Number of minutes to add (negative to subtract) | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.date](../) namespace.

