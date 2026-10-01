// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function realtimeAgent(inputs, options) {
  return createNode("openai.agents.RealtimeAgent", inputs, { id: options?.id, outputNames: ["chunk", "audio", "text"], outputTypes: { "chunk": "chunk", "audio": "audio", "text": "str" }, streamingInput: true });
}
function realtimeTranscription(inputs, options) {
  return createNode("openai.agents.RealtimeTranscription", inputs, { id: options?.id, outputNames: ["text", "chunk"], outputTypes: { "text": "str", "chunk": "chunk" }, streamingInput: true });
}
function liveAgent(inputs, options) {
  return createNode("openai.agents.LiveAgent", inputs, { id: options?.id, outputNames: ["chunk", "audio", "text", "input_transcript"], outputTypes: { "chunk": "chunk", "audio": "audio", "text": "str", "input_transcript": "str" }, streamingInput: true });
}
export {
  liveAgent,
  realtimeAgent,
  realtimeTranscription
};
