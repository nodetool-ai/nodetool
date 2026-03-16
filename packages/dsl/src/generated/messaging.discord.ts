// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";

// Discord Bot Trigger — messaging.discord.DiscordBotTrigger
export interface DiscordBotTriggerInputs {
  max_events?: Connectable<number>;
  token?: Connectable<string>;
  channel_id?: Connectable<string>;
  allow_bot_messages?: Connectable<boolean>;
}

export interface DiscordBotTriggerOutputs {
  message_id: OutputHandle<number>;
  content: OutputHandle<string>;
  author: OutputHandle<Record<string, unknown>>;
  channel: OutputHandle<Record<string, unknown>>;
  guild: OutputHandle<Record<string, unknown>>;
  attachments: OutputHandle<Record<string, unknown>[]>;
  timestamp: OutputHandle<string>;
  source: OutputHandle<string>;
  event_type: OutputHandle<string>;
}

export function discordBotTrigger(inputs: DiscordBotTriggerInputs): DslNode<DiscordBotTriggerOutputs> {
  return createNode("messaging.discord.DiscordBotTrigger", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Discord Send Message — messaging.discord.DiscordSendMessage
export interface DiscordSendMessageInputs {
  token?: Connectable<string>;
  channel_id?: Connectable<string>;
  content?: Connectable<string>;
  tts?: Connectable<boolean>;
  embeds?: Connectable<Record<string, unknown>[]>;
}

export function discordSendMessage(inputs: DiscordSendMessageInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("messaging.discord.DiscordSendMessage", inputs as Record<string, unknown>);
}
