---
layout: page
title: "Google Calendar Create Event"
node_type: "lib.google.CalendarCreateEvent"
namespace: "lib.google"
---

**Type:** `lib.google.CalendarCreateEvent`

**Namespace:** `lib.google`

## Description

Create a Google Calendar event from RFC3339 start and end times.
    google, calendar, event, create, schedule

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| summary | `str` | Event title | `` |
| start | `str` | RFC3339 start time, e.g. 2026-07-27T15:00:00-07:00 | `` |
| end | `str` | RFC3339 end time | `` |
| calendar_id | `str` | Calendar id, or 'primary' for the default calendar | `primary` |
| description | `str` | Event description | `` |
| attendees | `str` | Attendee email addresses, comma-separated | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict` |  |

## Related Nodes

Browse other nodes in the [lib.google](./) namespace.
