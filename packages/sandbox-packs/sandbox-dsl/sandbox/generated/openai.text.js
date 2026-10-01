// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function embedding(inputs, options) {
  return createNode("openai.text.Embedding", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list" }, defaultOutput: "output" });
}
function webSearch(inputs, options) {
  return createNode("openai.text.WebSearch", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function moderation(inputs, options) {
  return createNode("openai.text.Moderation", inputs, { id: options?.id, outputNames: ["flagged", "categories", "category_scores"], outputTypes: { "flagged": "bool", "categories": "dict[str, bool]", "category_scores": "dict[str, float]" } });
}
export {
  embedding,
  moderation,
  webSearch
};
