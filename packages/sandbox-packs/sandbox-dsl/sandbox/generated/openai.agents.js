// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function realtimeAgent(inputs) {
  return createNode("openai.agents.RealtimeAgent", inputs, { outputNames: ["chunk", "audio", "text"], streamingInput: true });
}
function realtimeTranscription(inputs) {
  return createNode("openai.agents.RealtimeTranscription", inputs, { outputNames: ["text", "chunk"], streamingInput: true });
}
function liveAgent(inputs) {
  return createNode("openai.agents.LiveAgent", inputs, { outputNames: ["chunk", "audio", "text", "input_transcript"], streamingInput: true });
}
export {
  liveAgent,
  realtimeAgent,
  realtimeTranscription
};
