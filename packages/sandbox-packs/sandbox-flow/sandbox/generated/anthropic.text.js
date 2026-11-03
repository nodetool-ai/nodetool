// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function webSearch(inputs) {
  return callNode("anthropic.text.WebSearch", inputs);
}
export {
  webSearch
};
