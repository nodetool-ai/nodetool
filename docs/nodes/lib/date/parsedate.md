---
layout: page
title: "Parse Date"
node_type: "lib.date.ParseDate"
namespace: "lib.date"
---

**Type:** `lib.date.ParseDate`

**Namespace:** `lib.date`

## Description

Parse a date string into components.
    date, parse, format

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| date_string | `str` | The date string to parse | `` |
| input_format | `Enum['%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y', '%B %d, %Y', '%Y%m%d', '%Y%m%d_%H%M%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M:%S%z']` | Format of the input date string | `%Y-%m-%d` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `date` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.date](../) namespace.

