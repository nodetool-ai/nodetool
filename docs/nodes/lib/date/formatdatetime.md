---
layout: page
title: "Format Date Time"
node_type: "lib.date.FormatDateTime"
namespace: "lib.date"
---

**Type:** `lib.date.FormatDateTime`

**Namespace:** `lib.date`

## Description

Convert a datetime object to a formatted string.
    datetime, format, convert

    Use cases:
    - Standardize date formats
    - Prepare dates for different systems

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| input_datetime | `datetime` | Datetime object to format | `{'type': 'datetime', 'year': 0, 'month': 0, 'day': 0, 'hour': 0, 'minute': 0, 'second': 0, 'microsecond': 0, 'tzinfo': 'UTC', 'utc_offset': 0}` |
| output_format | `Enum['%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y', '%B %d, %Y', '%Y%m%d', '%Y%m%d_%H%M%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M:%S%z']` | Desired output format | `%B %d, %Y` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.date](../) namespace.

