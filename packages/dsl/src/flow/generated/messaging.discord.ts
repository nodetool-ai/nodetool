// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";

// Discord Bot Trigger — messaging.discord.DiscordBotTrigger
export type DiscordBotTriggerInputs = {
  max_events?: number;
  token?: string;
  channel_id?: string;
  allow_bot_messages?: boolean;
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

export function discordBotTrigger(inputs: DiscordBotTriggerInputs): Promise<DiscordBotTriggerOutputs> {
  return callNode<DiscordBotTriggerOutputs>("messaging.discord.DiscordBotTrigger", inputs);
}

discordBotTrigger.stream = function (inputs: DiscordBotTriggerInputs): AsyncIterable<Partial<DiscordBotTriggerOutputs>> {
  return streamNode<Partial<DiscordBotTriggerOutputs>>("messaging.discord.DiscordBotTrigger", inputs);
};
