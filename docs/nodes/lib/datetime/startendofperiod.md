---
layout: page
title: "Start / End of Period"
node_type: "lib.datetime.StartEnd"
namespace: "lib.datetime"
---

**Type:** `lib.datetime.StartEnd`

**Namespace:** `lib.datetime`

## Description

Return the start and end of the given period (day, week, month, year).
    date, start, end, period, boundary

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| date | `any` |  | `` |
| unit | `enum` |  | `day` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| start_iso | `str` |  |
| end_iso | `str` |  |
| start | `datetime` |  |
| end | `datetime` |  |

## Related Nodes

Browse other nodes in the [lib.datetime](../) namespace.
