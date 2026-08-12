// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function screenshot(inputs) {
  return createNode("lib.browser.Screenshot", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  screenshot
};
