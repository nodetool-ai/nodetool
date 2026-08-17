// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function chatComplete(inputs) {
  return callNode("mistral.text.ChatComplete", inputs);
}
function codeComplete(inputs) {
  return callNode("mistral.text.CodeComplete", inputs);
}
export {
  chatComplete,
  codeComplete
};
