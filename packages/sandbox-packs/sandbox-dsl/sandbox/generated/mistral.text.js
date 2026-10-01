// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function chatComplete(inputs, options) {
  return createNode("mistral.text.ChatComplete", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function codeComplete(inputs, options) {
  return createNode("mistral.text.CodeComplete", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
export {
  chatComplete,
  codeComplete
};
