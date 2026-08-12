// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function groundedSearch(inputs) {
  return createNode("gemini.text.GroundedSearch", inputs, { outputNames: ["results", "sources", "text"] });
}
function embedding(inputs) {
  return createNode("gemini.text.Embedding", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  embedding,
  groundedSearch
};
