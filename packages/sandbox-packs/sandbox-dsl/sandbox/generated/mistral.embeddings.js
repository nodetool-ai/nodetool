// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function embedding(inputs) {
  return createNode("mistral.embeddings.Embedding", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  embedding
};
