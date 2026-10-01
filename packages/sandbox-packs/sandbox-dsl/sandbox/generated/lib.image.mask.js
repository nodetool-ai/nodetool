// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function apply(inputs, options) {
  return createNode("lib.image.mask.Apply", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function fromImage(inputs, options) {
  return createNode("lib.image.mask.FromImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function invert(inputs, options) {
  return createNode("lib.image.mask.Invert", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
export {
  apply,
  fromImage,
  invert
};
