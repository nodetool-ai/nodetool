// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function embedding(inputs) {
  return callNode("openai.text.Embedding", inputs);
}
function webSearch(inputs) {
  return callNode("openai.text.WebSearch", inputs);
}
function moderation(inputs) {
  return callNode("openai.text.Moderation", inputs);
}
export {
  embedding,
  moderation,
  webSearch
};
