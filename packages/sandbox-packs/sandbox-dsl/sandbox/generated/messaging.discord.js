// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function discordBotTrigger(inputs) {
  return createNode("messaging.discord.DiscordBotTrigger", inputs, { outputNames: ["message_id", "content", "author", "channel", "guild", "attachments", "timestamp", "source", "event_type"], streaming: true });
}
export {
  discordBotTrigger
};
