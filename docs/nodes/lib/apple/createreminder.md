---
layout: page
title: "Create Reminder"
node_type: "lib.apple.CreateReminder"
namespace: "lib.apple"
---

**Type:** `lib.apple.CreateReminder`

**Namespace:** `lib.apple`

## Description

Create a reminder in macOS Reminders via AppleScript.
    reminders, todo, macos

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| title | `str` | Title of the reminder | `` |
| due_date | `any` | Optional due date; leave empty for none | `` |
| list_name | `str` | Reminders list name | `Reminders` |
| notes | `str` | Additional notes | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `bool` |  |

## Related Nodes

Browse other nodes in the [lib.apple](./) namespace.
