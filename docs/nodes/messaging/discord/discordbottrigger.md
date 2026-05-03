---
layout: page
title: "Discord Bot Trigger"
node_type: "messaging.discord.DiscordBotTrigger"
namespace: "messaging.discord"
---

**Type:** `messaging.discord.DiscordBotTrigger`

**Namespace:** `messaging.discord`

## Description

Trigger node that listens for Discord messages from a bot account.

    This trigger connects to Discord using a bot token and emits events
    for incoming messages.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| max_events | `int` | Maximum number of events to process (0 = unlimited) | `0` |
| token | `str` | Discord bot token | `` |
| channel_id | `str` | Optional channel ID to filter messages | null |
| allow_bot_messages | `bool` | Include messages authored by bots | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| message_id | `int` |  |
| content | `str` |  |
| author | `dict[str, any]` |  |
| channel | `dict[str, any]` |  |
| guild | `dict[str, any]` |  |
| attachments | `list[dict[str, any]]` |  |
| timestamp | `str` |  |
| source | `str` |  |
| event_type | `str` |  |

## Related Nodes

Browse other nodes in the [messaging.discord](../) namespace.
