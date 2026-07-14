---
layout: page
title: "Create Calendar Event"
node_type: "lib.apple.CreateCalendarEvent"
namespace: "lib.apple"
---

**Type:** `lib.apple.CreateCalendarEvent`

**Namespace:** `lib.apple`

## Description

Create a new event in macOS Calendar via AppleScript.
    calendar, event, macos, applescript

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| event_title | `str` | Title of the calendar event | `` |
| start_date | `any` | Start date and time | `` |
| end_date | `any` | End date and time | `` |
| calendar_name | `str` | Name of the target calendar | `Calendar` |
| location | `str` | Location of the event | `` |
| description_text | `str` | Notes for the event | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `bool` |  |

## Related Nodes

Browse other nodes in the [lib.apple](./) namespace.
