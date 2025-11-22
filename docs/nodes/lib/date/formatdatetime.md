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
| input_datetime | `any` | Datetime object to format | `{'type': 'datetime', 'year': 0, 'month': 0, 'day': 0, 'hour': 0, 'minute': 0, 'second': 0, 'microsecond': 0, 'tzinfo': 'UTC', 'utc_offset': 0}` |
| output_format | `any` | Desired output format | `%B %d, %Y` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.date](../) namespace.

