// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";

// Telegram Bot Trigger — messaging.telegram.TelegramBotTrigger
export type TelegramBotTriggerInputs = {
  token?: string;
  chat_id?: number;
  allow_bot_messages?: boolean;
  include_edited_messages?: boolean;
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

export function telegramBotTrigger(inputs: TelegramBotTriggerInputs): Promise<TelegramBotTriggerOutputs> {
  return callNode<TelegramBotTriggerOutputs>("messaging.telegram.TelegramBotTrigger", inputs);
}

telegramBotTrigger.stream = function (inputs: TelegramBotTriggerInputs): AsyncIterable<Partial<TelegramBotTriggerOutputs>> {
  return streamNode<Partial<TelegramBotTriggerOutputs>>("messaging.telegram.TelegramBotTrigger", inputs);
};
