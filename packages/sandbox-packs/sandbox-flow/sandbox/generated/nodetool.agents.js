// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function summarizer(inputs) {
  return callNode("nodetool.agents.Summarizer", inputs);
}
summarizer.stream = function(inputs) {
  return streamNode("nodetool.agents.Summarizer", inputs);
};
function enhancePrompt(inputs) {
  return callNode("nodetool.agents.EnhancePrompt", inputs);
}
enhancePrompt.stream = function(inputs) {
  return streamNode("nodetool.agents.EnhancePrompt", inputs);
};
function createThread(inputs) {
  return callNode("nodetool.agents.CreateThread", inputs);
}
function extractor(inputs) {
  return callNode("nodetool.agents.Extractor", inputs);
}
function classifier(inputs) {
  return callNode("nodetool.agents.Classifier", inputs);
}
function agent(inputs) {
  return callNode("nodetool.agents.Agent", inputs);
}
agent.stream = function(inputs) {
  return streamNode("nodetool.agents.Agent", inputs);
};
function claudeCodeAgent(inputs) {
  return callNode("nodetool.agents.ClaudeCodeAgent", inputs);
}
claudeCodeAgent.stream = function(inputs) {
  return streamNode("nodetool.agents.ClaudeCodeAgent", inputs);
};
export {
  agent,
  classifier,
  claudeCodeAgent,
  createThread,
  enhancePrompt,
  extractor,
  summarizer
};
