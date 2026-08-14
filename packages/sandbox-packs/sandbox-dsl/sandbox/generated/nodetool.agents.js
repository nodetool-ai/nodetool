// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function summarizer(inputs) {
  return createNode("nodetool.agents.Summarizer", inputs, { outputNames: ["text", "chunk"], streaming: true });
}
function enhancePrompt(inputs) {
  return createNode("nodetool.agents.EnhancePrompt", inputs, { outputNames: ["text", "chunk"], streaming: true });
}
function createThread(inputs) {
  return createNode("nodetool.agents.CreateThread", inputs, { outputNames: ["thread_id"], defaultOutput: "thread_id" });
}
function extractor(inputs) {
  return createNode("nodetool.agents.Extractor", inputs, { outputNames: [] });
}
function classifier(inputs) {
  return createNode("nodetool.agents.Classifier", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function agent(inputs) {
  return createNode("nodetool.agents.Agent", inputs, { outputNames: ["text", "chunk", "thinking", "audio"], streaming: true });
}
function claudeCodeAgent(inputs) {
  return createNode("nodetool.agents.ClaudeCodeAgent", inputs, { outputNames: ["text", "chunk", "transcript", "session_id"], streaming: true });
}
export {
  agent,
  classifier,
  claudeCodeAgent,
  createThread,
  enhancePrompt,
  extractor,
  summarizer
};
