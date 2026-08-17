// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function screenshot(inputs) {
  return callNode("lib.browser.Screenshot", inputs);
}
export {
  screenshot
};
