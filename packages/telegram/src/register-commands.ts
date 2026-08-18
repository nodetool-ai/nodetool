/**
 * `setMyCommands` — a deploy step, not a boot step (design §12).
 *
 * Registering the command list is what makes `/link`, `/new` and the rest
 * autocomplete in the Telegram UI. It is idempotent: Telegram replaces the
 * whole list on every call, so running it twice leaves the same six commands.
 */

import { BotApi, type BotCommandSpec } from "./bot-api.js";
import { BOT_COMMANDS } from "./commands.js";

export interface RegisterCommandsOptions {
  readonly fetch?: typeof fetch;
  /** Bot API base URL, for tests. */
  readonly baseUrl?: string;
  /** Command list to register. Defaults to the bridge's own six. */
  readonly commands?: readonly BotCommandSpec[];
}

/**
 * Publish the bot's command list.
 *
 * @returns the commands that were registered.
 */
export async function registerCommands(
  botToken: string,
  options: RegisterCommandsOptions = {}
): Promise<readonly BotCommandSpec[]> {
  const init: { botToken: string; fetch: typeof fetch; baseUrl?: string } = {
    botToken,
    fetch: options.fetch ?? fetch
  };
  if (options.baseUrl !== undefined) {
    init.baseUrl = options.baseUrl;
  }
  const api = new BotApi(init);
  const commands = options.commands ?? BOT_COMMANDS;
  await api.setMyCommands(commands);
  return commands;
}

export { BOT_COMMANDS };
