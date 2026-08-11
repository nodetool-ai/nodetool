// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function chatComplete(inputs) {
  return createNode("xai.text.ChatComplete", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function webSearch(inputs) {
  return createNode("xai.text.WebSearch", inputs, { outputNames: ["output", "citations"] });
}
export {
  chatComplete,
  webSearch
};
