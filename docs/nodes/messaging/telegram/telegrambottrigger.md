---
layout: page
title: "Telegram Bot Trigger"
node_type: "messaging.telegram.TelegramBotTrigger"
namespace: "messaging.telegram"
---

**Type:** `messaging.telegram.TelegramBotTrigger`

**Namespace:** `messaging.telegram`

## Description

Trigger node that listens for Telegram messages using long polling.

    This trigger connects to Telegram using a bot token and emits events
    for incoming messages.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| max_events | `int` | Maximum number of events to process (0 = unlimited) | `0` |
| token | `str` | Telegram bot token | `` |
| chat_id | `int` | Optional chat ID to filter messages | null |
| allow_bot_messages | `bool` | Include messages authored by bots | `false` |
| include_edited_messages | `bool` | Include edited messages | `false` |
| poll_timeout_seconds | `int` | Long polling timeout in seconds | `30` |
| poll_interval_seconds | `float` | Delay between polling requests | `0.2` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| update_id | `int` |  |
| update_type | `str` |  |
| message_id | `int` |  |
| text | `str` |  |
| caption | `str` |  |
| entities | `list[dict[str, any]]` |  |
| chat | `dict[str, any]` |  |
| from_user | `dict[str, any]` |  |
| attachments | `list[dict[str, any]]` |  |
| timestamp | `str` |  |
| source | `str` |  |
| event_type | `str` |  |

## Related Nodes

Browse other nodes in the [messaging.telegram](../) namespace.
