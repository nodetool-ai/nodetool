// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function document(inputs) {
  return callNode("lib.svg.Document", inputs);
}
function svgToImage(inputs) {
  return callNode("lib.svg.SVGToImage", inputs);
}
export {
  document,
  svgToImage
};
