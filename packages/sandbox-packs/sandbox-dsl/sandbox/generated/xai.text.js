// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function chatComplete(inputs, options) {
  return createNode("xai.text.ChatComplete", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function webSearch(inputs, options) {
  return createNode("xai.text.WebSearch", inputs, { id: options?.id, outputNames: ["output", "citations"], outputTypes: { "output": "str", "citations": "list[str]" } });
}
export {
  chatComplete,
  webSearch
};
