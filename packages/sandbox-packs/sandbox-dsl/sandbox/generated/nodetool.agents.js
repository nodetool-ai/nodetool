// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function summarizer(inputs, options) {
  return createNode("nodetool.agents.Summarizer", inputs, { id: options?.id, outputNames: ["text", "chunk"], outputTypes: { "text": "str", "chunk": "chunk" }, streaming: true, outputCorrelation: { "text": { "kind": "single", "source": "__execution__" }, "chunk": { "kind": "iteration", "source": "__execution__", "group": "stream" } } });
}
function enhancePrompt(inputs, options) {
  return createNode("nodetool.agents.EnhancePrompt", inputs, { id: options?.id, outputNames: ["text", "chunk"], outputTypes: { "text": "str", "chunk": "chunk" }, streaming: true, outputCorrelation: { "text": { "kind": "single", "source": "__execution__" }, "chunk": { "kind": "iteration", "source": "__execution__", "group": "stream" } } });
}
function createThread(inputs, options) {
  return createNode("nodetool.agents.CreateThread", inputs, { id: options?.id, outputNames: ["thread_id"], outputTypes: { "thread_id": "str" }, defaultOutput: "thread_id" });
}
function extractor(inputs, options) {
  return createNode("nodetool.agents.Extractor", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
}
function classifier(inputs, options) {
  return createNode("nodetool.agents.Classifier", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function decision(inputs, options) {
  return createNode("nodetool.agents.Decision", inputs, { id: options?.id, outputNames: ["decision", "reason", "if_true", "if_false"], outputTypes: { "decision": "bool", "reason": "str", "if_true": "any", "if_false": "any" }, outputCorrelation: { "decision": { "kind": "single", "source": "__execution__" }, "reason": { "kind": "single", "source": "__execution__" }, "if_true": { "kind": "single", "source": "__execution__" }, "if_false": { "kind": "single", "source": "__execution__" } } });
}
function agent(inputs, options) {
  return createNode("nodetool.agents.Agent", inputs, { id: options?.id, outputNames: ["text", "chunk", "thinking", "audio"], outputTypes: { "text": "str", "chunk": "chunk", "thinking": "chunk", "audio": "audio" }, streaming: true, outputCorrelation: { "text": { "kind": "single", "source": "__execution__" }, "chunk": { "kind": "iteration", "source": "__execution__", "group": "stream" }, "thinking": { "kind": "iteration", "source": "__execution__", "group": "stream" }, "audio": { "kind": "iteration", "source": "__execution__", "group": "stream" } } });
}
export {
  agent,
  classifier,
  createThread,
  decision,
  enhancePrompt,
  extractor,
  summarizer
};
