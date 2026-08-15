---
layout: page
title: "Google Calendar List Events"
node_type: "lib.google.CalendarListEvents"
namespace: "lib.google"
---

**Type:** `lib.google.CalendarListEvents`

**Namespace:** `lib.google`

## Description

List Google Calendar events in a time window, soonest first.
    google, calendar, events, schedule, agenda

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| calendar_id | `str` | Calendar id, or 'primary' for the default calendar | `primary` |
| time_min | `str` | RFC3339 window start (blank for now) | `` |
| time_max | `str` | RFC3339 window end | `` |
| max_results | `int` | Maximum number of events to return | `20` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict` |  |
| outputs | `list` |  |

## Related Nodes

Browse other nodes in the [lib.google](./) namespace.
