---
layout: page
title: "Telegram Bot"
permalink: /telegram-bot
description: "Chat with your NodeTool agent from Telegram: link your account, use the bot commands, and run the bridge on your own server."
---

Link your Telegram account and you can message your NodeTool agent from Telegram. Each message runs as a chat turn on your NodeTool account, with your tools, assets and budget, and the answer streams back into the chat.

> **Runs:** on your NodeTool server, through a Telegram bot that the server's admin runs. **Needs:** a Telegram account and a NodeTool account you sign in to. A desktop install without a login cannot link Telegram.
{: .callout-note}

If you run your own server, set up the bot first. See [Run the bridge (self-hosting)](#run-the-bridge-self-hosting).

## Link your account

Link once, from NodeTool or from Telegram. Both ways create the same link.

**From NodeTool**

1. Open **Settings → Integrations → Connected accounts**.
2. Click **Connect Telegram**.
3. Click **Open Telegram and press Start**, then press **Start** in the bot chat. If the page shows a `/start` command instead of the button, send that command to the bot.
4. The page shows "Connected to Telegram as" followed by your Telegram id.

**From Telegram**

1. Send the bot `/link`.
2. Open the link it replies with, while signed in to NodeTool.
3. Check that the page names your Telegram account, then click **Confirm**.
4. Go back to the chat and say hello.

A link code works once and expires after 10 minutes. If it has expired, send `/link` again.

## Use the bot

Send a text message and the agent answers. A status line shows what it is doing, and a stop button under the reply cancels the turn. Images and files the agent makes arrive as photos or documents.

| Command | What it does |
|---|---|
| `/start` | Shows a welcome and whether your account is linked |
| `/link` | Starts linking and replies with a confirmation link |
| `/new` | Starts a new conversation |
| `/stop` | Stops the running turn |
| `/status` | Shows whether the server is up, your link, the current conversation, and how many messages are waiting |
| `/unlink` | Unlinks this Telegram account |

The agent runs in *Auto* [permission mode](global-chat.md#permission-modes) here, so it does not stop to ask before routine actions.

Limits:

- The bot works in private chats only. In a group it says so once and then ignores the group.
- It reads text only. Photos, documents and voice notes get a reply saying so.
- While a turn runs, up to 3 more messages wait in line. Past that, the bot asks you to send again when it is done.
- Files the bot sends are limited to Telegram's 50 MB.

## Unlink

Send `/unlink` in the chat, or open **Settings → Integrations → Connected accounts**, click **Disconnect** and confirm. The bot stops answering that Telegram account.

## When something goes wrong

| What you see | What to do |
|---|---|
| The bot says the server is single-user | The server has no login, so there is no account to link. Use a server with a login. See [Authentication](authentication.md). |
| "This bot is restricted to a configured list of Telegram accounts, and yours is not on it." | Ask the admin to add your Telegram id to the bot's allowlist. |
| The link page shows an error | The code expired or was already used. Send `/link` for a new one. |
| "I do not know that command." | Use one of the commands in the table above. |

## Run the bridge (self-hosting)

This part is for whoever runs the NodeTool server. The bridge is a separate process, started with `nodetool telegram serve`, that passes messages between Telegram and the server. It can run on the server machine or anywhere that reaches both the server and Telegram.

The server must use a login, such as Supabase auth. See [Authentication](authentication.md).

1. **Create the bot.** In Telegram, message `@BotFather`, send `/newbot`, and follow the prompts. Copy the token it returns (it looks like `123456:AA...`) and note the bot's username.
2. **Configure the server.** Set these and restart the server:

   | Variable | Purpose |
   |---|---|
   | `NODETOOL_INTEGRATION_TOKEN` | A secret of at least 16 characters shared by the server and the bridge. Without it, account linking is off |
   | `TELEGRAM_BOT_USERNAME` | Optional. The bot's username without `@`. Adds the **Open Telegram and press Start** button to the settings page |
   | `NODETOOL_PUBLIC_URL` | Optional. The address browsers use to reach the server, for the link pages. Set it when the bridge reaches the server at an internal address such as `http://nodetool:7777` |

3. **Start the bridge.** Set the bridge's variables and run it:

   ```bash
   export TELEGRAM_BOT_TOKEN=123456:AA...
   export NODETOOL_INTEGRATION_TOKEN=the-same-value-the-server-has
   export NODETOOL_API_URL=https://nodetool.example.com   # default http://127.0.0.1:7777

   nodetool telegram register-commands   # once per deploy, so Telegram suggests the commands
   nodetool telegram serve
   ```

   `serve` prints `Telegram bridge polling against <server URL>` when it is ready. Only one bridge can run per bot token. If a second one starts, it stops with a message that another process holds the token.

4. **Optional: restrict who can use the bot.** By default any Telegram user who finds the bot can link an account. To allow only some, put their Telegram user ids in a `telegram-bot.json` file next to where the bridge runs, or pass it with `--config`:

   ```json
   { "allowUsers": ["123456789"], "maxQueuedTurns": 3 }
   ```

   `maxQueuedTurns` sets how many messages wait behind a running turn. All options and flags are in the [CLI reference](cli.md#nodetool-telegram).
