// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function groundedSearch(inputs) {
  return callNode("gemini.text.GroundedSearch", inputs);
}
function embedding(inputs) {
  return callNode("gemini.text.Embedding", inputs);
}
export {
  embedding,
  groundedSearch
};
