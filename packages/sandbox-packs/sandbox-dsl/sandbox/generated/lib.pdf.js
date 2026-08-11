// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function screenshot(inputs) {
  return createNode("lib.pdf.Screenshot", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function pdftoppm(inputs) {
  return createNode("lib.pdf.Pdftoppm", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  pdftoppm,
  screenshot
};
