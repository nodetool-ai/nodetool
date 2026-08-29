// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function document(inputs) {
  return createNode("lib.svg.Document", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function svgToImage(inputs) {
  return createNode("lib.svg.SVGToImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  document,
  svgToImage
};
