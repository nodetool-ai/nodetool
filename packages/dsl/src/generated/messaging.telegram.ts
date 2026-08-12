// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Telegram Bot Trigger — messaging.telegram.TelegramBotTrigger
export type TelegramBotTriggerInputs = {
  max_events?: Connectable<number>;
  token?: Connectable<string>;
  chat_id?: Connectable<number>;
  allow_bot_messages?: Connectable<boolean>;
  include_edited_messages?: Connectable<boolean>;
  poll_timeout_seconds?: Connectable<number>;
  poll_interval_seconds?: Connectable<number>;
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

export function telegramBotTrigger(inputs: TelegramBotTriggerInputs): DslNode<TelegramBotTriggerOutputs> {
  return createNode("messaging.telegram.TelegramBotTrigger", inputs, { outputNames: ["update_id", "update_type", "message_id", "text", "caption", "entities", "chat", "from_user", "attachments", "timestamp", "source", "event_type"], streaming: true });
}
