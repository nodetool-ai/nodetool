// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function groundedSearch(inputs, options) {
  return createNode("vertex.text.GroundedSearch", inputs, { id: options?.id, outputNames: ["results", "sources", "text"], outputTypes: { "results": "list[str]", "sources": "list[source]", "text": "str" } });
}
function embedding(inputs, options) {
  return createNode("vertex.text.Embedding", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list" }, defaultOutput: "output" });
}
export {
  embedding,
  groundedSearch
};
