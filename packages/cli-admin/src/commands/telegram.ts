/**
 * `nodetool telegram` — run the Telegram bridge, and publish its command list.
 *
 * Thin wrappers over `@nodetool-ai/telegram`, imported dynamically so the CLI
 * pays nothing for the bridge (and its `ws` dependency) on every other
 * command. Registration is deliberately its own subcommand: `setMyCommands` is
 * a deploy step, not a boot step (design §12).
 */

import type { Command } from "commander";

/** Config problems are the likely failure here; print them, not a stack. */
function fail(e: unknown): never {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}

/** `loadConfig` takes the default path when `--config` is absent. */
function configOptions(path: string | undefined): { configPath?: string } {
  const options: { configPath?: string } = {};
  if (path !== undefined) {
    options.configPath = path;
  }
  return options;
}

export function registerTelegramCommands(program: Command): void {
  const telegram = program
    .command("telegram")
    .description("Telegram bridge — private-chat turns onto the agent loop");

  telegram
    .command("serve")
    .description("Long-poll the Bot API and run turns on each linked user's account")
    .option("--config <path>", "Path to telegram-bot.json")
    .action(async (opts: { config?: string }) => {
      try {
        const { loadConfig, startTelegramBot } = await import("@nodetool-ai/telegram");
        const config = loadConfig(configOptions(opts.config));
        const handle = startTelegramBot(config);
        const shutdown = (): void => {
          void handle.stop();
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
        console.log(`Telegram bridge polling against ${config.apiUrl}`);
        const reason = await handle.finished;
        if (reason !== "stopped") {
          process.exitCode = 1;
        }
      } catch (e) {
        fail(e);
      }
    });

  telegram
    .command("register-commands")
    .description("Publish the bot's command list to Telegram (setMyCommands)")
    .option("--config <path>", "Path to telegram-bot.json")
    .action(async (opts: { config?: string }) => {
      try {
        const { loadConfig, registerCommands } = await import("@nodetool-ai/telegram");
        const config = loadConfig(configOptions(opts.config));
        const commands = await registerCommands(config.botToken);
        console.log(`Registered ${commands.length} bot commands.`);
      } catch (e) {
        fail(e);
      }
    });
}
