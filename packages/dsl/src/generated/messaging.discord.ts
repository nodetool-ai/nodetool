// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Discord Bot Trigger — messaging.discord.DiscordBotTrigger
export interface DiscordBotTriggerInputs {
  max_events?: Connectable<number>;
  token?: Connectable<string>;
  channel_id?: Connectable<string>;
  allow_bot_messages?: Connectable<boolean>;
}

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

export function discordBotTrigger(
  inputs: DiscordBotTriggerInputs
): DslNode<DiscordBotTriggerOutputs> {
  return createNode(
    "messaging.discord.DiscordBotTrigger",
    inputs as Record<string, unknown>,
    {
      outputNames: [
        "message_id",
        "content",
        "author",
        "channel",
        "guild",
        "attachments",
        "timestamp",
        "source",
        "event_type"
      ],
      streaming: true
    }
  );
}

// Discord Send Message — messaging.discord.DiscordSendMessage
export interface DiscordSendMessageInputs {
  token?: Connectable<string>;
  channel_id?: Connectable<string>;
  content?: Connectable<string>;
  tts?: Connectable<boolean>;
  embeds?: Connectable<Record<string, unknown>[]>;
}

export interface DiscordSendMessageOutputs {
  output: Record<string, unknown>;
}

export function discordSendMessage(
  inputs: DiscordSendMessageInputs
): DslNode<DiscordSendMessageOutputs, "output"> {
  return createNode(
    "messaging.discord.DiscordSendMessage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
