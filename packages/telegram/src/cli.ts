#!/usr/bin/env node
/**
 * `npx @nodetool-ai/telegram` — run the bridge standalone next to any server.
 *
 * Config comes from the environment plus an optional `telegram-bot.json`
 * (design §11). A config mistake is the most likely failure here, so it prints
 * the offending fields and exits — never a stack trace.
 */

import { TelegramConfigError, loadConfig } from "./config.js";
import { registerCommands } from "./register-commands.js";
import { startTelegramBot } from "./index.js";

const USAGE = `nodetool-telegram — NodeTool's Telegram bridge

Usage:
  nodetool-telegram [serve]        Long-poll for updates and run turns
  nodetool-telegram register       Publish the bot's command list (setMyCommands)

Environment:
  TELEGRAM_BOT_TOKEN           required (from @BotFather)
  NODETOOL_API_URL             default http://127.0.0.1:7777
  NODETOOL_INTEGRATION_TOKEN   required (the bot's service token)
`;

async function main(argv: readonly string[]): Promise<number> {
  const command = argv[0] ?? "serve";
  if (command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (command !== "serve" && command !== "register" && command !== "register-commands") {
    process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
    return 2;
  }

  const config = loadConfig();

  if (command !== "serve") {
    const commands = await registerCommands(config.botToken);
    process.stdout.write(`Registered ${commands.length} bot commands.\n`);
    return 0;
  }

  const handle = startTelegramBot(config);
  const shutdown = (): void => {
    void handle.stop();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.stdout.write(`Telegram bridge polling against ${config.apiUrl}\n`);
  const reason = await handle.finished;
  return reason === "stopped" ? 0 : 1;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    if (err instanceof TelegramConfigError) {
      process.stderr.write(`${err.message}\n`);
    } else {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exitCode = 1;
  });
