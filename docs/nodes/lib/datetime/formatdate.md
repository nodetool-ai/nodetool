---
layout: page
title: "Format Date"
node_type: "lib.datetime.Format"
namespace: "lib.datetime"
---

**Type:** `lib.datetime.Format`

**Namespace:** `lib.datetime`

## Description

Parse a date string/number/Date and format it. Supports tokens YYYY, MM, DD, HH, mm, ss, SSS, Z. Use [brackets] for literals.
    date, format, parse, strftime

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| date | `any` | Date string, number (epoch ms), or Date. | `` |
| pattern | `str` | Format pattern (YYYY, MM, DD, HH, mm, ss, SSS, Z). | `YYYY-MM-DD HH:mm:ss` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| formatted | `str` |  |
| iso | `str` |  |
| epoch_ms | `int` |  |

## Related Nodes

Browse other nodes in the [lib.datetime](../) namespace.
