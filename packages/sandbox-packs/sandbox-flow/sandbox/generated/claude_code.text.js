// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function webSearch(inputs) {
  return callNode("claude_code.text.WebSearch", inputs);
}
export {
  webSearch
};
