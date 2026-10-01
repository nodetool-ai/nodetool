// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function embedding(inputs, options) {
  return createNode("mistral.embeddings.Embedding", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list" }, defaultOutput: "output" });
}
export {
  embedding
};
