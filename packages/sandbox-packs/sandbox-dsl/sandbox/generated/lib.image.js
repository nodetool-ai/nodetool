// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function mask(inputs) {
  return createNode("lib.image.Mask", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  mask
};
