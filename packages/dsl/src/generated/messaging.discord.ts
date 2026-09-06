// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Discord Bot Trigger — messaging.discord.DiscordBotTrigger
export type DiscordBotTriggerInputs = {
  token?: Connectable<string>;
  channel_id?: Connectable<string>;
  allow_bot_messages?: Connectable<boolean>;
};

export interface DiscordBotTriggerOutputs {
  message_id: number;
  content: string;
  author: Record<string, unknown>;
  channel: Record<string, unknown>;
  guild: Record<string, unknown>;
  attachments: Record<string, unknown>[];
  timestamp: string;
  source: string;
  event_type: string;
}

export function discordBotTrigger(inputs: DiscordBotTriggerInputs): DslNode<DiscordBotTriggerOutputs> {
  return createNode("messaging.discord.DiscordBotTrigger", inputs, { outputNames: ["message_id", "content", "author", "channel", "guild", "attachments", "timestamp", "source", "event_type"], streaming: true });
}
