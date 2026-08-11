// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function telegramBotTrigger(inputs) {
  return createNode("messaging.telegram.TelegramBotTrigger", inputs, { outputNames: ["update_id", "update_type", "message_id", "text", "caption", "entities", "chat", "from_user", "attachments", "timestamp", "source", "event_type"], streaming: true });
}
export {
  telegramBotTrigger
};
