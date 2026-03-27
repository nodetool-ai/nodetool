// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Telegram Bot Trigger — messaging.telegram.TelegramBotTrigger
export interface TelegramBotTriggerInputs {
  max_events?: Connectable<number>;
  token?: Connectable<string>;
  chat_id?: Connectable<number>;
  allow_bot_messages?: Connectable<boolean>;
  include_edited_messages?: Connectable<boolean>;
  poll_timeout_seconds?: Connectable<number>;
  poll_interval_seconds?: Connectable<number>;
}

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
  return createNode("messaging.telegram.TelegramBotTrigger", inputs as Record<string, unknown>, { outputNames: ["update_id", "update_type", "message_id", "text", "caption", "entities", "chat", "from_user", "attachments", "timestamp", "source", "event_type"], streaming: true });
}

// Telegram Send Message — messaging.telegram.TelegramSendMessage
export interface TelegramSendMessageInputs {
  token?: Connectable<string>;
  chat_id?: Connectable<number>;
  text?: Connectable<string>;
  parse_mode?: Connectable<string>;
  disable_web_page_preview?: Connectable<boolean>;
  disable_notification?: Connectable<boolean>;
  reply_to_message_id?: Connectable<number>;
}

export interface TelegramSendMessageOutputs {
  output: Record<string, unknown>;
}

export function telegramSendMessage(inputs: TelegramSendMessageInputs): DslNode<TelegramSendMessageOutputs, "output"> {
  return createNode("messaging.telegram.TelegramSendMessage", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
