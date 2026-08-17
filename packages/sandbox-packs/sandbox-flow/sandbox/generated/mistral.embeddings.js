// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function embedding(inputs) {
  return callNode("mistral.embeddings.Embedding", inputs);
}
export {
  embedding
};
