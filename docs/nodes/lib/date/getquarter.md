---
layout: page
title: "Get Quarter"
node_type: "lib.date.GetQuarter"
namespace: "lib.date"
---

**Type:** `lib.date.GetQuarter`

**Namespace:** `lib.date`

## Description

Get the quarter number and start/end dates for a given datetime.
    datetime, quarter, period

    Use cases:
    - Financial reporting periods
    - Quarterly analytics

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| input_datetime | `any` | Input datetime | `{'type': 'datetime', 'year': 0, 'month': 0, 'day': 0, 'hour': 0, 'minute': 0, 'second': 0, 'microsecond': 0, 'tzinfo': 'UTC', 'utc_offset': 0}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| quarter | `any` |  |
| quarter_start | `any` |  |
| quarter_end | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.date](../) namespace.

