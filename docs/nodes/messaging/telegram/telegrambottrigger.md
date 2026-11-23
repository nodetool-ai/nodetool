---
layout: page
title: "Telegram Bot Trigger"
node_type: "messaging.telegram.TelegramBotTrigger"
namespace: "messaging.telegram"
---

**Type:** `messaging.telegram.TelegramBotTrigger`

**Namespace:** `messaging.telegram`

## Description

Listen for Telegram messages using long polling and emit them as events.
    telegram, trigger, bot, messages, chat, events, listen

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| token | `str` | Telegram bot token | `` |
| chat_id | `int` | Optional chat ID to filter messages | null |
| allow_bot_messages | `bool` | Include messages authored by bots | `false` |
| include_edited_messages | `bool` | Include edited messages | `false` |

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

Browse other nodes in the [messaging.telegram](./) namespace.
