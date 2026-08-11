// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function realtimeAgent(inputs) {
  return createNode("openai.agents.RealtimeAgent", inputs, { outputNames: ["chunk", "audio", "text"], streamingInput: true });
}
function realtimeTranscription(inputs) {
  return createNode("openai.agents.RealtimeTranscription", inputs, { outputNames: ["text", "chunk"], streamingInput: true });
}
export {
  realtimeAgent,
  realtimeTranscription
};
