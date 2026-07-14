---
layout: page
title: "List Calendar Events"
node_type: "lib.apple.ListCalendarEvents"
namespace: "lib.apple"
---

**Type:** `lib.apple.ListCalendarEvents`

**Namespace:** `lib.apple`

## Description

List events from a Calendar in a date range using AppleScript.
    calendar, list, events, macos

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| days_back | `int` | Days back from today | `0` |
| days_forward | `int` | Days forward from today | `7` |
| calendar_name | `str` | Calendar to query | `Calendar` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| events | `list` |  |

## Related Nodes

Browse other nodes in the [lib.apple](./) namespace.
