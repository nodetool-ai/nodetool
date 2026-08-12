// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function embedding(inputs) {
  return createNode("openai.text.Embedding", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function webSearch(inputs) {
  return createNode("openai.text.WebSearch", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function moderation(inputs) {
  return createNode("openai.text.Moderation", inputs, { outputNames: ["flagged", "categories", "category_scores"] });
}
export {
  embedding,
  moderation,
  webSearch
};
