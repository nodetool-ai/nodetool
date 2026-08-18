// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function telegramBotTrigger(inputs) {
  return callNode("messaging.telegram.TelegramBotTrigger", inputs);
}
telegramBotTrigger.stream = function(inputs) {
  return streamNode("messaging.telegram.TelegramBotTrigger", inputs);
};
export {
  telegramBotTrigger
};
