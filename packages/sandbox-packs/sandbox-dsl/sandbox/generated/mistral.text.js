// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function chatComplete(inputs) {
  return createNode("mistral.text.ChatComplete", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function codeComplete(inputs) {
  return createNode("mistral.text.CodeComplete", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  chatComplete,
  codeComplete
};
