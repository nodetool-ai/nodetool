// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function discordBotTrigger(inputs) {
  return callNode("messaging.discord.DiscordBotTrigger", inputs);
}
discordBotTrigger.stream = function(inputs) {
  return streamNode("messaging.discord.DiscordBotTrigger", inputs);
};
export {
  discordBotTrigger
};
