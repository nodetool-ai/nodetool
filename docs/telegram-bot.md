---
layout: page
title: "Telegram Bot"
permalink: /telegram-bot
description: "Chat with your NodeTool agent from Telegram by running the bridge, creating a bot with BotFather, and linking your account."
---

The Telegram bridge lets you message your NodeTool agent from a phone. It is a separate process started with `nodetool telegram serve`. It turns each private-chat message into an agent turn on a running NodeTool server and streams the answer back into the chat. The bridge holds no conversation state and no user credentials. The agent loop, tools, permissions, threads and cost tracking stay on the server, and each turn runs as the NodeTool account linked to the Telegram user.

This guide covers setup from end to end. For the command reference see [CLI](cli.md#nodetool-telegram). For the design see [telegram-bot-design.md](telegram-bot-design.md).

## Requirements

- A NodeTool server in an authenticated mode, such as Supabase auth. In local single-user mode every request is user `1`, so a delegated token would isolate nothing. The server refuses to issue one and the bot answers that the server is single-user. See [Authentication](authentication.md).
- A Telegram account.
- A machine that can reach both the NodeTool server and the Telegram Bot API.

## 1. Create the bot with BotFather

1. In Telegram, open a chat with `@BotFather`.
2. Send `/newbot` and answer the prompts for a name and a username.
3. Copy the token BotFather returns. It looks like `123456:AA...`.
4. Note the bot's username without the `@`.

## 2. Configure the server

Set these on the **NodeTool server** and restart it:

| Variable | Purpose |
|---|---|
| `NODETOOL_INTEGRATION_TOKEN` | Service token that lets the bridge call the linking routes. At least 16 characters. When it is unset or shorter, the `/api/integrations/*` routes do not exist |
| `TELEGRAM_BOT_USERNAME` | The bot's username without the `@`. Optional. With it, the settings page shows an **Open Telegram and press Start** link. Without it, you type the link code into the bot yourself |
| `NODETOOL_PUBLIC_URL` | Optional. The base URL that link confirmation pages use. Set it when the bridge reaches the server at an address your browser cannot, such as `http://nodetool:7777` inside a compose network |

See [Configuration](configuration.md) for the full variable table.

## 3. Set the token and start the bridge

Set these on the **bridge process**, which can run on the same machine as the server or on another one:

| Variable | Required | Purpose |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | The BotFather token |
| `NODETOOL_INTEGRATION_TOKEN` | Yes | The same value the server has |
| `NODETOOL_API_URL` | No | Server address. Default `http://127.0.0.1:7777` |

```bash
export TELEGRAM_BOT_TOKEN=123456:AA...
export NODETOOL_INTEGRATION_TOKEN=the-same-value-the-server-has

# Publish the command list so Telegram autocompletes it. Run it once per deploy.
nodetool telegram register-commands

# Poll Telegram and serve turns
nodetool telegram serve
```

Both subcommands check the configuration first and print every field that failed. `serve` prints `Telegram bridge polling against <server URL>` when it starts, and `SIGINT` or `SIGTERM` stops it.

The bridge uses long polling with `getUpdates` and nothing else. Webhook mode is not implemented. Setting `TELEGRAM_WEBHOOK_URL` makes `serve` refuse to start. Only one process can poll a bot token. If a second one starts, the polling loop ends with a message that another `getUpdates` consumer holds the token. Stop the other instance and start again.

## 4. Link your NodeTool account

Each Telegram account must be linked to a NodeTool account before the bot runs turns for it. There are two ways, and both write the same link.

**From NodeTool**

1. Open **Settings** and go to **Integrations**, then **Connected Accounts**.
2. Click **Connect Telegram**.
3. Click **Open Telegram and press Start**, then press **Start** in the bot chat. If the server has no `TELEGRAM_BOT_USERNAME`, send the bot `/start <code>` with the code shown on the page.
4. The page shows "Connected as Telegram account" followed by your Telegram id.

**From Telegram**

1. Send the bot `/link`.
2. Open the URL it replies with while signed in to NodeTool. The URL points to `/integrations/link?code=...`.
3. The page names the Telegram account. Check it, then click **Confirm**.
4. Return to the chat and say hello.

A link code is valid for 10 minutes and works once. An expired or used code shows an error, and `/link` issues a new one. The server decides which NodeTool account is linked from your signed-in session, never from the code alone.

## Allowlist

By default any Telegram user who finds the bot can start linking. To restrict it, list Telegram user ids in `allowUsers` in a `telegram-bot.json` file for the bridge:

```jsonc
{
  "allowUsers": ["123456789"],
  "editThrottleMs": 1500,
  "maxQueuedTurns": 3
}
```

Pass the file with `nodetool telegram serve --config ./telegram-bot.json`. Without `--config`, the bridge reads `telegram-bot.json` from its working directory if one exists. A user who is not on a non-empty list gets "This bot is restricted to a configured list of Telegram accounts, and yours is not on it." for every message and command.

The allowlist is a file setting, not an environment variable. The other two keys control the minimum gap between edits of one streamed reply in milliseconds, and how many messages queue behind a running turn.

## What the bot can do

Send a text message and the bot runs it as an agent turn on your account with your tools, assets and budget. The bridge sends turns in agent mode with permission mode `auto`. The reply streams into the chat by editing messages. A status line shows what the agent is doing, and an inline stop button cancels the turn. Assets the agent produces arrive as photos or documents.

| Command | What it does |
|---|---|
| `/start` | Shows a welcome and your link state. With a code, `/start <code>` finishes linking |
| `/link` | Starts linking and replies with a confirmation URL |
| `/unlink` | Unlinks this Telegram account. Needs a linked account |
| `/new` | Starts a fresh conversation thread. Needs a linked account |
| `/stop` | Cancels the running turn. Needs a linked account |
| `/status` | Reports server health, link state, current thread, whether a turn is running, and queue depth |

Commands never reach the model. Anything else starting with `/` gets "I do not know that command."

Limits to know:

- The bot works in private chats only. In a group it answers once that it works in private chat and then ignores the group.
- It handles text only. Photos, documents and voice notes get a reply saying so.
- A private chat is one conversation. While a turn runs, further messages queue up to `maxQueuedTurns` (default 3). Beyond that the bot asks you to resend when it is done.
- Uploads from the bot are bounded by Telegram's 50 MB limit.

## Unlink

Use `/unlink` in the chat, or open **Settings**, **Integrations**, **Connected Accounts**, click **Disconnect** and confirm. The bot stops answering that Telegram account.
