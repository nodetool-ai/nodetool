// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function document(inputs, options) {
  return createNode("lib.svg.Document", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "svg" }, defaultOutput: "output" });
}
function svgToImage(inputs, options) {
  return createNode("lib.svg.SVGToImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
export {
  document,
  svgToImage
};
