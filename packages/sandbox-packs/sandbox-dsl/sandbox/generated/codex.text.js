// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function webSearch(inputs, options) {
  return createNode("codex.text.WebSearch", inputs, { id: options?.id, outputNames: ["text", "sources"], outputTypes: { "text": "str", "sources": "list" } });
}
export {
  webSearch
};
