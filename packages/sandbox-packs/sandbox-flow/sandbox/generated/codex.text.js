// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function webSearch(inputs) {
  return callNode("codex.text.WebSearch", inputs);
}
export {
  webSearch
};
