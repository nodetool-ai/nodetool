// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

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

export function discordBotTrigger(inputs: DiscordBotTriggerInputs, options?: NodeOptions): NodeWithOutputs<DiscordBotTriggerOutputs> {
  return createNode("messaging.discord.DiscordBotTrigger", inputs, { id: options?.id, outputNames: ["message_id", "content", "author", "channel", "guild", "attachments", "timestamp", "source", "event_type"], outputTypes: {"message_id":"int","content":"str","author":"dict[str, any]","channel":"dict[str, any]","guild":"dict[str, any]","attachments":"list[dict[str, any]]","timestamp":"str","source":"str","event_type":"str"}, streaming: true, inputMode: "buffered", outputCorrelation: {"message_id":{"kind":"iteration","source":"__execution__","group":"messages"},"content":{"kind":"iteration","source":"__execution__","group":"messages"},"author":{"kind":"iteration","source":"__execution__","group":"messages"},"channel":{"kind":"iteration","source":"__execution__","group":"messages"},"guild":{"kind":"iteration","source":"__execution__","group":"messages"},"attachments":{"kind":"iteration","source":"__execution__","group":"messages"},"timestamp":{"kind":"iteration","source":"__execution__","group":"messages"},"source":{"kind":"iteration","source":"__execution__","group":"messages"},"event_type":{"kind":"iteration","source":"__execution__","group":"messages"}} });
}
