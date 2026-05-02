---
layout: page
title: "Telegram Send Message"
node_type: "messaging.telegram.TelegramSendMessage"
namespace: "messaging.telegram"
---

**Type:** `messaging.telegram.TelegramSendMessage`

**Namespace:** `messaging.telegram`

## Description

Node that sends a message to a Telegram chat using a bot token.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| token | `str` | Telegram bot token | `` |
| chat_id | `int` | Target chat ID | `0` |
| text | `str` | Message text | `` |
| parse_mode | `str` | Optional parse mode (MarkdownV2 or HTML) | `` |
| disable_web_page_preview | `bool` | Disable link previews | `false` |
| disable_notification | `bool` | Send silently | `false` |
| reply_to_message_id | `int` | Reply to a specific message ID | null |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict[str, any]` |  |

## Related Nodes

Browse other nodes in the [messaging.telegram](../) namespace.
