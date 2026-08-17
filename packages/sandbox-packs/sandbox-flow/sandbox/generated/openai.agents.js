// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function realtimeAgent(inputs) {
  return callNode("openai.agents.RealtimeAgent", inputs);
}
realtimeAgent.stream = function(inputs) {
  return streamNode("openai.agents.RealtimeAgent", inputs);
};
function realtimeTranscription(inputs) {
  return callNode("openai.agents.RealtimeTranscription", inputs);
}
realtimeTranscription.stream = function(inputs) {
  return streamNode("openai.agents.RealtimeTranscription", inputs);
};
export {
  realtimeAgent,
  realtimeTranscription
};
