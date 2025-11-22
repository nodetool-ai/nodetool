---
layout: page
title: "Parse Date Time"
node_type: "lib.date.ParseDateTime"
namespace: "lib.date"
---

**Type:** `lib.date.ParseDateTime`

**Namespace:** `lib.date`

## Description

Parse a date/time string into components.
    datetime, parse, format

    Use cases:
    - Extract date components from strings
    - Convert between date formats

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| datetime_string | `str` | The datetime string to parse | `` |
| input_format | `Enum['%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y', '%B %d, %Y', '%Y%m%d', '%Y%m%d_%H%M%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M:%S%z']` | Format of the input datetime string | `%Y-%m-%d` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `datetime` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.date](../) namespace.

