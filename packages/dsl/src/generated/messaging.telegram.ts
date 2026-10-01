// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Telegram Bot Trigger — messaging.telegram.TelegramBotTrigger
export type TelegramBotTriggerInputs = {
  token?: Connectable<string>;
  chat_id?: Connectable<number>;
  allow_bot_messages?: Connectable<boolean>;
  include_edited_messages?: Connectable<boolean>;
};

export interface TelegramBotTriggerOutputs {
  update_id: number;
  update_type: string;
  message_id: number;
  text: string;
  caption: string;
  entities: Record<string, unknown>[];
  chat: Record<string, unknown>;
  from_user: Record<string, unknown>;
  attachments: Record<string, unknown>[];
  timestamp: string;
  source: string;
  event_type: string;
}

export function telegramBotTrigger(inputs: TelegramBotTriggerInputs, options?: NodeOptions): NodeWithOutputs<TelegramBotTriggerOutputs> {
  return createNode("messaging.telegram.TelegramBotTrigger", inputs, { id: options?.id, outputNames: ["update_id", "update_type", "message_id", "text", "caption", "entities", "chat", "from_user", "attachments", "timestamp", "source", "event_type"], outputTypes: {"update_id":"int","update_type":"str","message_id":"int","text":"str","caption":"str","entities":"list[dict[str, any]]","chat":"dict[str, any]","from_user":"dict[str, any]","attachments":"list[dict[str, any]]","timestamp":"str","source":"str","event_type":"str"}, streaming: true, inputMode: "buffered", outputCorrelation: {"update_id":{"kind":"iteration","source":"__execution__","group":"messages"},"update_type":{"kind":"iteration","source":"__execution__","group":"messages"},"message_id":{"kind":"iteration","source":"__execution__","group":"messages"},"text":{"kind":"iteration","source":"__execution__","group":"messages"},"caption":{"kind":"iteration","source":"__execution__","group":"messages"},"entities":{"kind":"iteration","source":"__execution__","group":"messages"},"chat":{"kind":"iteration","source":"__execution__","group":"messages"},"from_user":{"kind":"iteration","source":"__execution__","group":"messages"},"attachments":{"kind":"iteration","source":"__execution__","group":"messages"},"timestamp":{"kind":"iteration","source":"__execution__","group":"messages"},"source":{"kind":"iteration","source":"__execution__","group":"messages"},"event_type":{"kind":"iteration","source":"__execution__","group":"messages"}} });
}
