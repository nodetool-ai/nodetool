---
layout: page
title: "Discord Send Message"
node_type: "messaging.discord.DiscordSendMessage"
namespace: "messaging.discord"
---

**Type:** `messaging.discord.DiscordSendMessage`

**Namespace:** `messaging.discord`

## Description

Node that sends a message to a Discord channel using a bot token.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| token | `str` | Discord bot token | `` |
| channel_id | `str` | Target channel ID | `` |
| content | `str` | Message content | `` |
| tts | `bool` | Send as text-to-speech | `false` |
| embeds | `list[dict[str, any]]` | Embeds as Discord embed dictionaries | null |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict[str, any]` |  |

## Related Nodes

Browse other nodes in the [messaging.discord](../) namespace.
