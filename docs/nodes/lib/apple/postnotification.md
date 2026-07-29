---
layout: page
title: "Post Notification"
node_type: "lib.apple.PostNotification"
namespace: "lib.apple"
---

**Type:** `lib.apple.PostNotification`

**Namespace:** `lib.apple`

## Description

Post a notification to macOS Notification Center via AppleScript.
    notification, alert, macos

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| title | `str` | Notification title | `Nodetool` |
| subtitle | `str` | Notification subtitle | `` |
| message | `str` | Notification body | `` |
| sound_name | `str` | Optional sound name (e.g. 'Glass'); empty = silent | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `bool` |  |

## Related Nodes

Browse other nodes in the [lib.apple](./) namespace.
