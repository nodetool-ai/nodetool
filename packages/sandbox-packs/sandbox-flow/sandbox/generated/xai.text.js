// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function chatComplete(inputs) {
  return callNode("xai.text.ChatComplete", inputs);
}
function webSearch(inputs) {
  return callNode("xai.text.WebSearch", inputs);
}
export {
  chatComplete,
  webSearch
};
