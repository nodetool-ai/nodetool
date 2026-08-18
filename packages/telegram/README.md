# @nodetool-ai/telegram

The Telegram bridge for NodeTool. It translates Telegram updates into
`chat_message` commands on a running NodeTool server's `/ws` chat protocol, and
the streamed `ProcessingMessage` frames back into Telegram messages. The agent
loop, tools, permissions, thread persistence and cost tracking stay on the
server — this package holds no user credentials and no conversation state.

Design: [docs/telegram-bot-design.md](../../docs/telegram-bot-design.md).
Plan: [docs/telegram-bot-implementation-plan.md](../../docs/telegram-bot-implementation-plan.md).

## Status

Milestone M2 is landing in waves. This package currently ships the pure core:

| Module | What it owns |
|---|---|
| `src/config.ts` | Env + `telegram-bot.json`, zod-validated at the boundary |
| `src/chunk.ts` | 3800-char splitter that reopens fences and inline tags it cuts |
| `src/markdown-html.ts` | Agent markdown → Telegram HTML, plain-text fallback |
| `src/frame-renderer.ts` | Pure fold of server frames → render ops |

`startTelegramBot` / `stopTelegramBot` throw until the identity client, turn
router and Bot API adapter land (T2.5–T2.9).

## Configuration

```
TELEGRAM_BOT_TOKEN           required (from @BotFather)
NODETOOL_API_URL             default http://127.0.0.1:7777
NODETOOL_INTEGRATION_TOKEN   required (the bot's service token)
TELEGRAM_WEBHOOK_URL         optional; set = webhook mode, unset = long polling
TELEGRAM_WEBHOOK_SECRET      required in webhook mode
```

```jsonc
// telegram-bot.json (optional)
{
  "allowUsers": [],       // Telegram user ids allowed to link; empty = anyone
  "editThrottleMs": 1500,
  "maxQueuedTurns": 3
}
```

## Tests

```bash
npm run test --workspace=packages/telegram
```
