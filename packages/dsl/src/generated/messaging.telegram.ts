// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";

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
  update_id: OutputHandle<number>;
  update_type: OutputHandle<string>;
  message_id: OutputHandle<number>;
  text: OutputHandle<string>;
  caption: OutputHandle<string>;
  entities: OutputHandle<Record<string, unknown>[]>;
  chat: OutputHandle<Record<string, unknown>>;
  from_user: OutputHandle<Record<string, unknown>>;
  attachments: OutputHandle<Record<string, unknown>[]>;
  timestamp: OutputHandle<string>;
  source: OutputHandle<string>;
  event_type: OutputHandle<string>;
}

export function telegramBotTrigger(inputs: TelegramBotTriggerInputs): DslNode<TelegramBotTriggerOutputs> {
  return createNode("messaging.telegram.TelegramBotTrigger", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
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

export function telegramSendMessage(inputs: TelegramSendMessageInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("messaging.telegram.TelegramSendMessage", inputs as Record<string, unknown>);
}
