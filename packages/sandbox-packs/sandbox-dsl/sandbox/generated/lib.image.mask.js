// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function apply(inputs) {
  return createNode("lib.image.mask.Apply", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function fromImage(inputs) {
  return createNode("lib.image.mask.FromImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function invert(inputs) {
  return createNode("lib.image.mask.Invert", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  apply,
  fromImage,
  invert
};
