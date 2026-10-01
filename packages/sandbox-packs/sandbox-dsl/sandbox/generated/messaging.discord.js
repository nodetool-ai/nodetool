// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function discordBotTrigger(inputs, options) {
  return createNode("messaging.discord.DiscordBotTrigger", inputs, { id: options?.id, outputNames: ["message_id", "content", "author", "channel", "guild", "attachments", "timestamp", "source", "event_type"], outputTypes: { "message_id": "int", "content": "str", "author": "dict[str, any]", "channel": "dict[str, any]", "guild": "dict[str, any]", "attachments": "list[dict[str, any]]", "timestamp": "str", "source": "str", "event_type": "str" }, streaming: true, inputMode: "buffered", outputCorrelation: { "message_id": { "kind": "iteration", "source": "__execution__", "group": "messages" }, "content": { "kind": "iteration", "source": "__execution__", "group": "messages" }, "author": { "kind": "iteration", "source": "__execution__", "group": "messages" }, "channel": { "kind": "iteration", "source": "__execution__", "group": "messages" }, "guild": { "kind": "iteration", "source": "__execution__", "group": "messages" }, "attachments": { "kind": "iteration", "source": "__execution__", "group": "messages" }, "timestamp": { "kind": "iteration", "source": "__execution__", "group": "messages" }, "source": { "kind": "iteration", "source": "__execution__", "group": "messages" }, "event_type": { "kind": "iteration", "source": "__execution__", "group": "messages" } } });
}
export {
  discordBotTrigger
};
